import { readFileSync, writeFileSync } from 'node:fs';

function read(path) {
  return readFileSync(path, 'utf8');
}

function write(path, content) {
  writeFileSync(path, content, 'utf8');
}

function replaceOnce(path, from, to, label) {
  const source = read(path);
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`Missing ${label || from.slice(0, 80)} in ${path}`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`Ambiguous ${label || from.slice(0, 80)} in ${path}`);
  write(path, source.slice(0, first) + to + source.slice(first + from.length));
}

const versioningSource = `export function parseTitleVersion(title) {
  const value = String(title || '').trim();
  const match = value.match(/^(.+)\\.(\\d+)$/);
  if (match) {
    const version = Number.parseInt(match[2], 10);
    if (version >= 2) return { base: match[1], version };
  }
  return { base: value, version: null };
}

export function getTitleBase(title) {
  return parseTitleVersion(title).base;
}

export function isSameFamily(left, right) {
  return getTitleBase(left) === getTitleBase(right);
}

export function getNextVersionTitle(currentTitle, existingTitles = []) {
  const base = getTitleBase(currentTitle) || 'Без названия';
  let foundFamily = false;
  let maxVersion = 1;

  for (const title of existingTitles) {
    const parsed = parseTitleVersion(title);
    if (parsed.base !== base) continue;
    foundFamily = true;
    maxVersion = Math.max(maxVersion, parsed.version || 1);
  }

  return foundFamily ? \`${'${base}'}.\${maxVersion + 1}\` : base;
}
`;
write('server/projectVersioning.js', versioningSource);

const safeApiSource = `import { randomUUID } from 'node:crypto';
import { createProjectWithQuota } from './projectQuotas.js';
import { getNextVersionTitle } from './projectVersioning.js';

function cleanTitle(value, fallback = 'Без названия') {
  return String(value || fallback).trim().slice(0, 120) || fallback;
}

async function createVersionedProject({
  pool,
  userId,
  requestedTitle,
  data,
  limits,
  touchProjectPhotoAssets,
  createProject = createProjectWithQuota,
}) {
  const titles = await pool.query('SELECT title FROM projects WHERE user_id = $1', [userId]);
  const title = cleanTitle(getNextVersionTitle(
    cleanTitle(requestedTitle),
    titles.rows.map((row) => row.title),
  ));
  const result = await createProject({
    pool,
    userId,
    id: randomUUID(),
    title,
    data,
    limits,
  });
  await touchProjectPhotoAssets(userId, data);
  return result;
}

async function createOrReport(options, response, sendProjectMutationError) {
  try {
    return await createVersionedProject(options);
  } catch (error) {
    if (sendProjectMutationError(response, error)) return null;
    throw error;
  }
}

export async function handleSafeProjectVersionApi({
  request,
  response,
  path,
  method,
  pool,
  projectQuotaLimits,
  requireUser,
  readBody,
  sendJson,
  touchProjectPhotoAssets,
  sendProjectMutationError,
  createProject,
}) {
  const projectMatch = path.match(/^\\/api\\/projects\\/([^/]+)$/);
  const recoveryMatch = path.match(/^\\/api\\/projects\\/([^/]+)\\/recover-public$/);
  const handlesRequest = (path === '/api/projects' && (method === 'GET' || method === 'POST'))
    || (projectMatch && method === 'PUT')
    || (recoveryMatch && method === 'POST');
  if (!handlesRequest) return false;

  const user = await requireUser(request, response);
  if (!user) return true;

  if (method === 'GET' && path === '/api/projects') {
    const result = await pool.query(
      \`SELECT p.id, p.title, p.created_at, p.updated_at,
              EXISTS(
                SELECT 1 FROM public_albums pa
                 WHERE pa.user_id = p.user_id AND pa.project_id = p.id
              ) AS has_public_snapshot
         FROM projects p
        WHERE p.user_id = $1
        ORDER BY p.updated_at DESC\`,
      [user.id],
    );
    sendJson(response, 200, { projects: result.rows });
    return true;
  }

  if (method === 'POST' && path === '/api/projects') {
    const body = await readBody(request);
    const data = body.data || {};
    const result = await createOrReport({
      pool,
      userId: user.id,
      requestedTitle: body.title,
      data,
      limits: projectQuotaLimits,
      touchProjectPhotoAssets,
      createProject,
    }, response, sendProjectMutationError);
    if (result) sendJson(response, 200, result);
    return true;
  }

  if (projectMatch && method === 'PUT') {
    const projectId = decodeURIComponent(projectMatch[1]);
    const source = await pool.query(
      'SELECT id, title FROM projects WHERE id = $1 AND user_id = $2',
      [projectId, user.id],
    );
    if (!source.rows[0]) {
      sendJson(response, 404, { error: 'project_not_found', message: 'Проект не найден' });
      return true;
    }
    const body = await readBody(request);
    const data = body.data || {};
    const result = await createOrReport({
      pool,
      userId: user.id,
      requestedTitle: body.title || source.rows[0].title,
      data,
      limits: projectQuotaLimits,
      touchProjectPhotoAssets,
      createProject,
    }, response, sendProjectMutationError);
    if (result) sendJson(response, 200, result);
    return true;
  }

  if (recoveryMatch && method === 'POST') {
    const projectId = decodeURIComponent(recoveryMatch[1]);
    const source = await pool.query(
      'SELECT id, title FROM projects WHERE id = $1 AND user_id = $2',
      [projectId, user.id],
    );
    if (!source.rows[0]) {
      sendJson(response, 404, { error: 'project_not_found', message: 'Проект не найден' });
      return true;
    }
    const snapshot = await pool.query(
      \`SELECT share_token, title, data_json AS data, updated_at
         FROM public_albums
        WHERE user_id = $1 AND project_id = $2
        ORDER BY updated_at DESC
        LIMIT 1\`,
      [user.id, projectId],
    );
    if (!snapshot.rows[0]) {
      sendJson(response, 404, {
        error: 'public_snapshot_not_found',
        message: 'У этого проекта нет опубликованной копии для восстановления',
      });
      return true;
    }
    const recovered = await createOrReport({
      pool,
      userId: user.id,
      requestedTitle: source.rows[0].title || snapshot.rows[0].title,
      data: snapshot.rows[0].data,
      limits: projectQuotaLimits,
      touchProjectPhotoAssets,
      createProject,
    }, response, sendProjectMutationError);
    if (recovered) {
      sendJson(response, 200, {
        ...recovered,
        recoveredFrom: {
          projectId,
          shareToken: snapshot.rows[0].share_token,
          updatedAt: snapshot.rows[0].updated_at,
        },
      });
    }
    return true;
  }

  return false;
}
`;
write('server/safeProjectVersions.js', safeApiSource);

const versioningTest = `import assert from 'node:assert/strict';
import { getNextVersionTitle, getTitleBase, isSameFamily, parseTitleVersion } from './projectVersioning.js';

assert.deepEqual(parseTitleVersion('Фотоальбом'), { base: 'Фотоальбом', version: null });
assert.deepEqual(parseTitleVersion('Фотоальбом.2'), { base: 'Фотоальбом', version: 2 });
assert.equal(getTitleBase('Фотоальбом.7'), 'Фотоальбом');
assert.equal(isSameFamily('Фотоальбом', 'Фотоальбом.3'), true);
assert.equal(isSameFamily('Фотоальбом', 'Другой'), false);
assert.equal(getNextVersionTitle('Фотоальбом', []), 'Фотоальбом');
assert.equal(getNextVersionTitle('Фотоальбом', ['Фотоальбом']), 'Фотоальбом.2');
assert.equal(getNextVersionTitle('Фотоальбом.2', ['Фотоальбом', 'Фотоальбом.2']), 'Фотоальбом.3');
assert.equal(getNextVersionTitle('Фотоальбом', ['Фотоальбом', 'Фотоальбом.2', 'Фотоальбом.4']), 'Фотоальбом.5');
console.log('project versioning checks passed');
`;
write('server/projectVersioning.test.mjs', versioningTest);

const safeApiTest = `import assert from 'node:assert/strict';
import { handleSafeProjectVersionApi } from './safeProjectVersions.js';

function baseContext(overrides = {}) {
  const sent = [];
  return {
    sent,
    context: {
      request: {},
      response: {},
      pool: { query: async () => ({ rows: [] }) },
      projectQuotaLimits: { maxProjects: 25, maxStorageBytes: 1_000_000 },
      requireUser: async () => ({ id: 7 }),
      readBody: async () => ({ title: 'Фотоальбом', data: { pages: [{ id: 'p1' }] } }),
      sendJson: (_response, status, payload) => sent.push({ status, payload }),
      touchProjectPhotoAssets: async () => {},
      sendProjectMutationError: () => false,
      createProject: async ({ id, title }) => ({ project: { id, title }, quota: {} }),
      ...overrides,
    },
  };
}

{
  const { sent, context } = baseContext({
    path: '/api/projects',
    method: 'POST',
    pool: { query: async (sql) => {
      assert.match(sql, /SELECT title FROM projects/);
      return { rows: [{ title: 'Фотоальбом' }, { title: 'Фотоальбом.2' }] };
    } },
  });
  assert.equal(await handleSafeProjectVersionApi(context), true);
  assert.equal(sent[0].payload.project.title, 'Фотоальбом.3');
}

{
  let createArgs = null;
  let queryIndex = 0;
  const { sent, context } = baseContext({
    path: '/api/projects/old/recover-public',
    method: 'POST',
    pool: { query: async () => {
      queryIndex += 1;
      if (queryIndex === 1) return { rows: [{ id: 'old', title: 'Фотоальбом' }] };
      if (queryIndex === 2) return { rows: [{ share_token: 'share', title: 'Фотоальбом', data: { pages: Array.from({ length: 54 }, (_, i) => ({ id: 'p' + i })) }, updated_at: '2026-08-30T04:00:00Z' }] };
      if (queryIndex === 3) return { rows: [{ title: 'Фотоальбом' }] };
      throw new Error('Unexpected query');
    } },
    createProject: async (args) => {
      createArgs = args;
      return { project: { id: args.id, title: args.title }, quota: {} };
    },
  });
  assert.equal(await handleSafeProjectVersionApi(context), true);
  assert.equal(createArgs.title, 'Фотоальбом.2');
  assert.equal(createArgs.data.pages.length, 54);
  assert.equal(sent[0].payload.recoveredFrom.shareToken, 'share');
}

{
  const { sent, context } = baseContext({
    path: '/api/projects',
    method: 'GET',
    pool: { query: async () => ({ rows: [{ id: 'a', title: 'Фотоальбом', has_public_snapshot: true }] }) },
  });
  assert.equal(await handleSafeProjectVersionApi(context), true);
  assert.equal(sent[0].payload.projects[0].has_public_snapshot, true);
}

console.log('safe project version API checks passed');
`;
write('server/safeProjectVersions.test.mjs', safeApiTest);

replaceOnce(
  'server.js',
  "import { createPublicAlbumToken, referencedPublicPhotoKey, rewritePublicAlbumProject } from './server/publicAlbumModel.js';\n",
  "import { createPublicAlbumToken, referencedPublicPhotoKey, rewritePublicAlbumProject } from './server/publicAlbumModel.js';\nimport { handleSafeProjectVersionApi } from './server/safeProjectVersions.js';\n",
  'safe project version import',
);

replaceOnce(
  'server.js',
  "  if (method === 'GET' && path === '/api/projects') {\n",
  `  const safeProjectVersionHandled = await handleSafeProjectVersionApi({
    request,
    response,
    path,
    method,
    pool,
    projectQuotaLimits,
    requireUser,
    readBody,
    sendJson,
    touchProjectPhotoAssets,
    sendProjectMutationError,
  });
  if (safeProjectVersionHandled) return true;

  if (method === 'GET' && path === '/api/projects') {\n`,
  'safe project version API bridge',
);

write('src/editor/cloudProjects.js', `const CURRENT_PROJECT_ID_KEY = 'collage-cloud-current-project-id';
const CURRENT_PROJECT_TITLE_KEY = 'collage-cloud-current-project-title';

function resolveProjectTitle(project) {
  const editorTitle = document.querySelector('.cloud-project-title')?.value;
  const storedTitle = localStorage.getItem(CURRENT_PROJECT_TITLE_KEY);
  return String(editorTitle || storedTitle || project?.title || 'Альбом без названия')
    .trim()
    .slice(0, 120) || 'Альбом без названия';
}

async function requestCloudSave(project, title) {
  const response = await fetch('/api/projects', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, data: project }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.message || payload?.error || 'Cloud save failed');
    error.status = response.status;
    throw error;
  }
  return payload?.project || payload;
}

function rememberCloudProject(project, fallbackTitle) {
  if (!project?.id) return;
  localStorage.setItem(CURRENT_PROJECT_ID_KEY, project.id);
  localStorage.setItem(CURRENT_PROJECT_TITLE_KEY, project.title || fallbackTitle);
}

export async function saveCloudProject(project) {
  const title = resolveProjectTitle(project);
  const created = await requestCloudSave(project, title);
  rememberCloudProject(created, title);
  return created;
}
`);

replaceOnce(
  'public/cloud-auth.js',
  `  window.__collageCloudAuth = {
    isAuthenticated: () => Boolean(state.user),
  };`,
  `  window.__collageCloudAuth = {
    isAuthenticated: () => Boolean(state.user),
    saveVersion: () => saveAsNew(),
  };`,
  'cloud auth bridge',
);

replaceOnce(
  'public/cloud-auth.js',
  `  function guessTitle(data) {
    const savedTitle = localStorage.getItem(CURRENT_PROJECT_TITLE_KEY);
    if (savedTitle) return savedTitle;
    const pages = Array.isArray(data?.pages) ? data.pages.length : 0;
    const date = new Date().toLocaleDateString('ru-RU');
    return pages ? \`Альбом \${date} · \${pages} стр.\` : \`Альбом \${date}\`;
  }
`,
  `  function guessTitle(data) {
    const savedTitle = localStorage.getItem(CURRENT_PROJECT_TITLE_KEY);
    if (savedTitle) return savedTitle;
    const pages = Array.isArray(data?.pages) ? data.pages.length : 0;
    const date = new Date().toLocaleDateString('ru-RU');
    return pages ? \`Альбом \${date} · \${pages} стр.\` : \`Альбом \${date}\`;
  }

  function titleBase(title) {
    const value = String(title || '').trim();
    const match = value.match(/^(.+)\\.(\\d+)$/);
    return match && Number(match[2]) >= 2 ? match[1] : value;
  }

  function sameTitleFamily(left, right) {
    return titleBase(left) === titleBase(right);
  }
`,
  'cloud title family helpers',
);

replaceOnce(
  'public/cloud-auth.js',
  `      const existingId = forceCreate ? '' : localStorage.getItem(CURRENT_PROJECT_ID_KEY);
      const url = existingId ? \`/api/projects/\${existingId}\` : '/api/projects';
      const method = existingId ? 'PUT' : 'POST';`,
  `      const url = '/api/projects';
      const method = 'POST';`,
  'cloud save always creates',
);

replaceOnce(
  'public/cloud-auth.js',
  `      finalStatus = editorProject.source === 'bridge' ? 'Сохранено в аккаунт' : 'Сохранено в аккаунт из локального сохранения';`,
  `      finalStatus = editorProject.source === 'bridge' ? 'Сохранена новая версия' : 'Сохранена новая версия из локального сохранения';`,
  'cloud save status',
);

replaceOnce(
  'public/cloud-auth.js',
  `  async function saveAsNew() {
    await saveCloud({ forceCreate: true });
  }

  async function openProject(id) {`,
  `  async function saveAsNew() {
    await saveCloud({ forceCreate: true });
  }

  async function openPreviousVersion() {
    if (state.busy) return;
    const currentId = localStorage.getItem(CURRENT_PROJECT_ID_KEY);
    const currentTitle = localStorage.getItem(CURRENT_PROJECT_TITLE_KEY) || '';
    if (!currentTitle) return setStatus('Сначала открой сохранённый проект');
    const currentProject = state.projects.find((project) => project.id === currentId);
    const currentTime = Date.parse(currentProject?.created_at || currentProject?.updated_at || '') || Number.POSITIVE_INFINITY;
    const family = state.projects
      .filter((project) => project.id !== currentId && sameTitleFamily(project.title, currentTitle))
      .filter((project) => (Date.parse(project.created_at || project.updated_at || '') || 0) < currentTime)
      .sort((left, right) => (Date.parse(right.created_at || right.updated_at || '') || 0) - (Date.parse(left.created_at || left.updated_at || '') || 0));
    const previous = family[0];
    if (!previous) return setStatus('Предыдущей версии этого альбома нет');
    await openProject(previous.id);
  }

  async function recoverPublicSnapshot(id) {
    if (state.busy) return;
    const project = state.projects.find((item) => item.id === id);
    if (!project?.has_public_snapshot) return setStatus('Опубликованная копия не найдена');
    if (!confirm(\`Восстановить опубликованную копию «\${project.title || 'альбом'}» как новый проект?\`)) return;
    state.busy = true;
    setStatus('Восстанавливаю опубликованную копию…');
    render();
    let finalStatus = '';
    try {
      const result = await api(\`/api/projects/\${id}/recover-public\`, { method: 'POST', body: '{}' });
      await loadProjects(false);
      finalStatus = \`Восстановлено как «\${result.project?.title || 'новая версия'}». Нажми «Открыть» у этой версии.\`;
    } catch (error) {
      finalStatus = error.message;
    } finally {
      state.busy = false;
      render();
      setStatus(finalStatus);
    }
  }

  async function openProject(id) {`,
  'previous and public recovery actions',
);

replaceOnce(
  'public/cloud-auth.js',
  `        el('button', { class: 'cloud-auth-button primary', type: 'button', disabled: state.busy ? 'disabled' : null, onclick: saveCloud, text: 'Сохранить' }),
        el('button', { class: 'cloud-auth-button', type: 'button', disabled: state.busy ? 'disabled' : null, onclick: saveAsNew, text: 'Как новый' }),`,
  `        el('button', { class: 'cloud-auth-button primary', type: 'button', disabled: state.busy ? 'disabled' : null, onclick: saveCloud, text: 'Сохранить версию' }),
        el('button', { class: 'cloud-auth-button', type: 'button', disabled: state.busy ? 'disabled' : null, onclick: openPreviousVersion, text: 'Предыдущая версия' }),`,
  'account version buttons',
);

replaceOnce(
  'public/cloud-auth.js',
  `      el('div', { class: 'cloud-auth-status', text: currentId ? 'Этот проект связан с аккаунтом.' : 'Сохрани, чтобы создать проект в аккаунте.' }),`,
  `      el('div', { class: 'cloud-auth-status', text: currentId ? 'Каждое сохранение создаёт новую версию. Старые остаются, пока ты сама их не удалишь.' : 'Сохрани, чтобы создать первую версию проекта.' }),`,
  'account version status',
);

replaceOnce(
  'public/cloud-auth.js',
  `          el('div', { class: 'cloud-project-actions' }, [
            el('button', { class: 'cloud-auth-button', type: 'button', onclick: () => openProject(project.id), text: 'Открыть' }),
            el('button', { class: 'cloud-auth-button danger', type: 'button', onclick: () => deleteProject(project.id), text: 'Удалить' }),
          ]),`,
  `          el('div', { class: 'cloud-project-actions' }, [
            el('button', { class: 'cloud-auth-button', type: 'button', onclick: () => openProject(project.id), text: 'Открыть' }),
            ...(project.has_public_snapshot ? [
              el('button', { class: 'cloud-auth-button', type: 'button', onclick: () => recoverPublicSnapshot(project.id), text: 'Восстановить публикацию' }),
            ] : []),
            el('button', { class: 'cloud-auth-button danger', type: 'button', onclick: () => deleteProject(project.id), text: 'Удалить' }),
          ]),`,
  'public recovery project action',
);

replaceOnce(
  'tests/cloud-auth.test.mjs',
  `{
  const calls = [];
  const harness = createHarness(async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET' });
    if (url === '/api/projects/original-project' && options.method === 'PUT') {
      return jsonResponse(200, { project: { id: 'original-project', title: 'Исходный альбом' } });
    }
    if (url === '/api/projects') return jsonResponse(200, { projects: [] });
    throw new Error(\`Unexpected request: \${options.method || 'GET'} \${url}\`);
  });

  await harness.api.saveCloud();
  assert.equal(calls[0].method, 'PUT');
  assert.equal(calls[0].url, '/api/projects/original-project');
}
`,
  `{
  const calls = [];
  const harness = createHarness(async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET' });
    if (url === '/api/projects' && options.method === 'POST') {
      return jsonResponse(200, { project: { id: 'version-2', title: 'Исходный альбом.2' } });
    }
    if (url === '/api/projects') return jsonResponse(200, { projects: [] });
    throw new Error(\`Unexpected request: \${options.method || 'GET'} \${url}\`);
  });

  await harness.api.saveCloud();
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].url, '/api/projects');
  assert.equal(harness.localStorage.getItem(CURRENT_PROJECT_ID_KEY), 'version-2');
  assert.equal(harness.localStorage.getItem(CURRENT_PROJECT_TITLE_KEY), 'Исходный альбом.2');
}
`,
  'cloud save version test',
);

replaceOnce(
  'tests/cloud-auth.test.mjs',
  `assert.match(saveAsNewBody, /saveCloud\\(\\{\\s*forceCreate:\\s*true\\s*\\}\\)/);`,
  `assert.match(saveAsNewBody, /saveCloud\\(\\{\\s*forceCreate:\\s*true\\s*\\}\\)/);
assert.match(source, /Сохранить версию/);
assert.match(source, /Предыдущая версия/);
assert.match(source, /Восстановить публикацию/);
assert.match(source, /recover-public/);`,
  'cloud recovery source assertions',
);

const packageJson = JSON.parse(read('package.json'));
packageJson.scripts.test = packageJson.scripts.test.replace(
  'node server/publicAlbumModel.test.mjs &&',
  'node server/publicAlbumModel.test.mjs && node server/projectVersioning.test.mjs && node server/safeProjectVersions.test.mjs &&',
);
write('package.json', JSON.stringify(packageJson, null, 2) + '\n');

console.log('Safe save, version history, and public snapshot recovery applied.');
