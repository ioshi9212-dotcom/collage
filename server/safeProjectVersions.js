import { randomUUID } from 'node:crypto';
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
  const projectMatch = path.match(/^\/api\/projects\/([^/]+)$/);
  const recoveryMatch = path.match(/^\/api\/projects\/([^/]+)\/recover-public$/);
  const handlesRequest = (path === '/api/projects' && (method === 'GET' || method === 'POST'))
    || (projectMatch && method === 'PUT')
    || (recoveryMatch && method === 'POST');
  if (!handlesRequest) return false;

  const user = await requireUser(request, response);
  if (!user) return true;

  if (method === 'GET' && path === '/api/projects') {
    const result = await pool.query(
      `SELECT p.id, p.title, p.created_at, p.updated_at,
              EXISTS(
                SELECT 1 FROM public_albums pa
                 WHERE pa.user_id = p.user_id AND pa.project_id = p.id
              ) AS has_public_snapshot
         FROM projects p
        WHERE p.user_id = $1
        ORDER BY p.updated_at DESC`,
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
      `SELECT share_token, title, data_json AS data, updated_at
         FROM public_albums
        WHERE user_id = $1 AND project_id = $2
        ORDER BY updated_at DESC
        LIMIT 1`,
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
