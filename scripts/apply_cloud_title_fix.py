from pathlib import Path


def replace_once(text, old, new, label):
    if old in text:
        return text.replace(old, new, 1)
    if new in text:
        return text
    raise SystemExit(f'patch anchor not found: {label}')


cloud_path = Path('public/cloud-auth.js')
cloud = cloud_path.read_text(encoding='utf-8')
cloud = replace_once(
    cloud,
    """    const forceCreate = options?.forceCreate === true;
    if (!state.user) return setStatus('Сначала войди в аккаунт');
    state.busy = true;
""",
    """    const forceCreate = options?.forceCreate === true;
    if (!state.user) return setStatus('Сначала войди в аккаунт');
    const requestedTitle = document.querySelector('.cloud-project-title')?.value || '';
    state.busy = true;
""",
    'capture cloud title before render',
)
cloud = replace_once(
    cloud,
    """      const titleInput = document.querySelector('.cloud-project-title');
      const title = (titleInput?.value || guessTitle(editorProject.data)).trim() || 'Без названия';
""",
    """      const title = (requestedTitle || guessTitle(editorProject.data)).trim() || 'Без названия';
""",
    'use captured cloud title',
)
cloud_path.write_text(cloud, encoding='utf-8')


test_path = Path('public/cloud-auth.test.mjs')
test = test_path.read_text(encoding='utf-8')
test = replace_once(
    test,
    """  return {
    api: window.__cloudAuthTest,
    localStorage,
    getReloadCount: () => reloadCount,
  };
""",
    """  return {
    api: window.__cloudAuthTest,
    document,
    localStorage,
    getReloadCount: () => reloadCount,
  };
""",
    'expose fake document',
)
anchor = """  assert.equal(harness.localStorage.getItem(CURRENT_PROJECT_TITLE_KEY), 'Исходный альбом');
}

for (const failure of [
"""
insert = """  assert.equal(harness.localStorage.getItem(CURRENT_PROJECT_TITLE_KEY), 'Исходный альбом');
}

{
  let submittedTitle = '';
  const harness = createHarness(async (url, options = {}) => {
    if (url === '/api/projects' && options.method === 'POST') {
      submittedTitle = JSON.parse(options.body).title;
      return jsonResponse(201, { project: { id: 'named-project', title: submittedTitle } });
    }
    if (url === '/api/projects') return jsonResponse(200, { projects: [] });
    throw new Error(`Unexpected request: ${options.method || 'GET'} ${url}`);
  });
  const titleInput = harness.document.createElement('input');
  titleInput.className = 'cloud-project-title';
  titleInput.value = 'Мой семейный альбом';
  harness.document.register(titleInput);

  await harness.api.saveAsNew();

  assert.equal(submittedTitle, 'Мой семейный альбом', 'cloud save must read the title before busy-state render replaces the input');
  assert.equal(harness.localStorage.getItem(CURRENT_PROJECT_TITLE_KEY), 'Мой семейный альбом');
}

for (const failure of [
"""
test = replace_once(test, anchor, insert, 'cloud title regression test')
test_path.write_text(test, encoding='utf-8')
