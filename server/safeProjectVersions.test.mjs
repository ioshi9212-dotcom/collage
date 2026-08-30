import assert from 'node:assert/strict';
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
