import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SOURCE_PATH = new URL('./cloud-auth.js', import.meta.url);
const CURRENT_PROJECT_ID_KEY = 'collage-cloud-current-project-id';
const CURRENT_PROJECT_TITLE_KEY = 'collage-cloud-current-project-title';

class FakeElement {
  constructor(tag, document) {
    this.tagName = String(tag).toUpperCase();
    this.ownerDocument = document;
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.className = '';
    this.textContent = '';
    this.value = '';
    this.innerHTML = '';
  }

  setAttribute(key, value) {
    this.attributes[key] = String(value);
    if (key === 'value') this.value = String(value);
  }

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }

  append(...children) {
    this.children.push(...children);
    for (const child of children) {
      if (child?.className) this.ownerDocument.register(child);
    }
  }
}

class FakeDocument {
  constructor() {
    this.byClass = new Map();
    this.body = new FakeElement('body', this);
  }

  register(element) {
    for (const className of String(element.className || '').split(/\s+/).filter(Boolean)) {
      this.byClass.set(className, element);
    }
  }

  createElement(tag) {
    return new FakeElement(tag, this);
  }

  querySelector(selector) {
    if (!selector.startsWith('.')) return null;
    return this.byClass.get(selector.slice(1)) || null;
  }
}

class FakeStorage {
  constructor(entries = {}) {
    this.map = new Map(Object.entries(entries));
  }

  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }

  setItem(key, value) {
    this.map.set(String(key), String(value));
  }

  removeItem(key) {
    this.map.delete(String(key));
  }
}

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
  };
}

function createHarness(fetchImpl) {
  const document = new FakeDocument();
  const localStorage = new FakeStorage({
    [CURRENT_PROJECT_ID_KEY]: 'original-project',
    [CURRENT_PROJECT_TITLE_KEY]: 'Исходный альбом',
  });
  const window = {
    __collageApp: {
      getProject: () => ({ title: 'Проект', pages: [{ id: 'page-1' }] }),
    },
    addEventListener() {},
  };

  const source = readFileSync(SOURCE_PATH, 'utf8').replace(
    "  window.addEventListener('DOMContentLoaded', () => {",
    "  window.__cloudAuthTest = { state, saveCloud, saveAsNew };\n\n  window.addEventListener('DOMContentLoaded', () => {",
  );

  const context = vm.createContext({
    window,
    document,
    localStorage,
    fetch: fetchImpl,
    Blob,
    URL,
    console,
    confirm: () => true,
    location: { reload() {} },
    setTimeout: (callback) => callback(),
    clearTimeout() {},
  });

  vm.runInContext(source, context, { filename: 'cloud-auth.js' });
  window.__cloudAuthTest.state.user = { id: 1, email: 'owner@example.com' };

  return {
    api: window.__cloudAuthTest,
    localStorage,
  };
}

{
  const calls = [];
  const harness = createHarness(async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET' });
    if (url === '/api/projects' && options.method === 'POST') {
      return jsonResponse(201, { project: { id: 'new-project', title: 'Исходный альбом' } });
    }
    if (url === '/api/projects') return jsonResponse(200, { projects: [] });
    throw new Error(`Unexpected request: ${options.method || 'GET'} ${url}`);
  });

  await harness.api.saveAsNew();

  assert.deepEqual(calls.map(({ url, method }) => `${method} ${url}`), [
    'POST /api/projects',
    'GET /api/projects',
  ]);
  assert.equal(harness.localStorage.getItem(CURRENT_PROJECT_ID_KEY), 'new-project');
  assert.equal(harness.localStorage.getItem(CURRENT_PROJECT_TITLE_KEY), 'Исходный альбом');
}

for (const failure of [
  new Error('network unavailable'),
  jsonResponse(409, { error: 'project_limit_reached', message: 'Лимит проектов исчерпан' }),
  jsonResponse(413, { error: 'payload_too_large', message: 'Проект слишком большой' }),
]) {
  const calls = [];
  const harness = createHarness(async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET' });
    if (failure instanceof Error) throw failure;
    return failure;
  });

  await harness.api.saveAsNew();

  assert.equal(calls.length, 1, 'failed save-as-new must make one create request');
  assert.equal(calls[0].url, '/api/projects');
  assert.equal(calls[0].method, 'POST');
  assert.equal(harness.localStorage.getItem(CURRENT_PROJECT_ID_KEY), 'original-project');
  assert.equal(harness.localStorage.getItem(CURRENT_PROJECT_TITLE_KEY), 'Исходный альбом');
}

{
  const calls = [];
  let releaseCreate;
  const createResponse = new Promise((resolve) => {
    releaseCreate = () => resolve(jsonResponse(201, { project: { id: 'single-copy', title: 'Исходный альбом' } }));
  });
  const harness = createHarness(async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET' });
    if (url === '/api/projects' && options.method === 'POST') return createResponse;
    if (url === '/api/projects') return jsonResponse(200, { projects: [] });
    throw new Error(`Unexpected request: ${options.method || 'GET'} ${url}`);
  });

  const first = harness.api.saveAsNew();
  const second = harness.api.saveAsNew();
  assert.equal(calls.filter((call) => call.method === 'POST').length, 1, 'rapid clicks must create only one copy');
  releaseCreate();
  await Promise.all([first, second]);
  assert.equal(harness.localStorage.getItem(CURRENT_PROJECT_ID_KEY), 'single-copy');
}

{
  const calls = [];
  const harness = createHarness(async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET' });
    if (url === '/api/projects/original-project' && options.method === 'PUT') {
      return jsonResponse(200, { project: { id: 'original-project', title: 'Исходный альбом' } });
    }
    if (url === '/api/projects') return jsonResponse(200, { projects: [] });
    throw new Error(`Unexpected request: ${options.method || 'GET'} ${url}`);
  });

  await harness.api.saveCloud();
  assert.equal(calls[0].method, 'PUT');
  assert.equal(calls[0].url, '/api/projects/original-project');
}

const source = readFileSync(SOURCE_PATH, 'utf8');
const saveAsNewBody = source.match(/async function saveAsNew\(\) \{([\s\S]*?)\n  \}/)?.[1] || '';
assert.doesNotMatch(saveAsNewBody, /removeItem\(CURRENT_PROJECT_ID_KEY\)/);
assert.match(saveAsNewBody, /saveCloud\(\{\s*forceCreate:\s*true\s*\}\)/);

console.log('cloud save-as-new checks passed');
