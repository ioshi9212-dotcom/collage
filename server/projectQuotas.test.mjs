import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ProjectNotFoundError,
  ProjectQuotaError,
  assertCreateProjectQuota,
  assertUpdateProjectQuota,
  createProjectWithQuota,
  getProjectQuotaLimits,
  serializeProjectData,
  updateProjectWithQuota,
} from './projectQuotas.js';

class FakePool {
  constructor(projects = []) {
    this.projects = projects.map((project) => ({ ...project }));
    this.logs = [];
    this.releaseCount = 0;
  }

  async connect() {
    const pool = this;
    return {
      async query(sql, params = []) {
        const normalized = String(sql).replace(/\s+/g, ' ').trim();
        pool.logs.push({ sql: normalized, params });

        if (normalized === 'BEGIN' || normalized === 'COMMIT' || normalized === 'ROLLBACK') return { rows: [] };
        if (normalized.startsWith('SELECT id FROM users WHERE id = $1 FOR UPDATE')) {
          return { rows: [{ id: params[0] }] };
        }
        if (normalized.startsWith('SELECT COUNT(*)::integer AS project_count')) {
          const owned = pool.projects.filter((project) => project.user_id === params[0]);
          return {
            rows: [{
              project_count: owned.length,
              storage_bytes: owned.reduce((sum, project) => sum + Number(project.data_bytes || 0), 0),
            }],
          };
        }
        if (normalized.startsWith('SELECT data_bytes FROM projects')) {
          const found = pool.projects.find((project) => project.id === params[0] && project.user_id === params[1]);
          return { rows: found ? [{ data_bytes: found.data_bytes }] : [] };
        }
        if (normalized.startsWith('INSERT INTO projects')) {
          const [id, userId, title, json, dataBytes] = params;
          const project = {
            id,
            user_id: userId,
            title,
            data_json: JSON.parse(json),
            data_bytes: dataBytes,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          pool.projects.push(project);
          return { rows: [project] };
        }
        if (normalized.startsWith('UPDATE projects SET title')) {
          const [title, json, dataBytes, projectId, userId] = params;
          const project = pool.projects.find((item) => item.id === projectId && item.user_id === userId);
          if (!project) return { rows: [] };
          project.title = title;
          project.data_json = JSON.parse(json);
          project.data_bytes = dataBytes;
          project.updated_at = new Date().toISOString();
          return { rows: [project] };
        }

        throw new Error(`Unexpected SQL: ${normalized}`);
      },
      release() {
        pool.releaseCount += 1;
      },
    };
  }
}

const defaults = getProjectQuotaLimits({});
assert.equal(defaults.maxProjects, 25);
assert.equal(defaults.maxStorageBytes, 500 * 1024 * 1024);
assert.deepEqual(getProjectQuotaLimits({ MAX_PROJECTS_PER_USER: '7', MAX_USER_STORAGE_BYTES: '12345' }), {
  maxProjects: 7,
  maxStorageBytes: 12345,
});
assert.deepEqual(getProjectQuotaLimits({ MAX_PROJECTS_PER_USER: '0', MAX_USER_STORAGE_BYTES: 'bad' }), defaults);

const unicode = serializeProjectData({ title: 'Фото 🌿' });
assert.equal(unicode.bytes, Buffer.byteLength(unicode.json, 'utf8'));

assert.throws(
  () => assertCreateProjectQuota({ projectCount: 2, storageBytes: 10, newProjectBytes: 1, limits: { maxProjects: 2, maxStorageBytes: 100 } }),
  (error) => error instanceof ProjectQuotaError && error.code === 'project_limit_reached' && error.status === 409,
);
assert.throws(
  () => assertCreateProjectQuota({ projectCount: 1, storageBytes: 90, newProjectBytes: 11, limits: { maxProjects: 2, maxStorageBytes: 100 } }),
  (error) => error instanceof ProjectQuotaError && error.code === 'storage_quota_exceeded',
);

assert.deepEqual(
  assertUpdateProjectQuota({
    projectCount: 2,
    storageBytes: 130,
    currentProjectBytes: 80,
    newProjectBytes: 60,
    limits: { maxProjects: 2, maxStorageBytes: 100 },
  }),
  { projectCount: 2, storageBytes: 110 },
  'an account already above a lowered quota must be allowed to shrink',
);
assert.throws(
  () => assertUpdateProjectQuota({
    projectCount: 2,
    storageBytes: 90,
    currentProjectBytes: 40,
    newProjectBytes: 60,
    limits: { maxProjects: 2, maxStorageBytes: 100 },
  }),
  (error) => error instanceof ProjectQuotaError && error.code === 'storage_quota_exceeded',
);

const pool = new FakePool();
const limits = { maxProjects: 1, maxStorageBytes: 10_000 };
const first = await createProjectWithQuota({
  pool,
  userId: 1,
  id: 'user-1-project',
  title: 'Первый',
  data: { pages: [{ id: 'p1' }] },
  limits,
});
assert.equal(first.quota.projectCount, 1);
assert.equal(pool.projects.length, 1);
assert.deepEqual(pool.logs.slice(0, 5).map((entry) => entry.sql.split(' ')[0]), ['BEGIN', 'SELECT', 'SELECT', 'INSERT', 'COMMIT']);
assert.match(pool.logs[1].sql, /FOR UPDATE$/);

await assert.rejects(
  createProjectWithQuota({
    pool,
    userId: 1,
    id: 'blocked-project',
    title: 'Лишний',
    data: { pages: [{ id: 'p2' }] },
    limits,
  }),
  (error) => error instanceof ProjectQuotaError && error.code === 'project_limit_reached',
);
assert.equal(pool.projects.length, 1, 'a rejected create must not write a project');
assert.equal(pool.logs.at(-1).sql, 'ROLLBACK');

await createProjectWithQuota({
  pool,
  userId: 2,
  id: 'user-2-project',
  title: 'Другой пользователь',
  data: { pages: [{ id: 'p3' }] },
  limits,
});
assert.equal(pool.projects.length, 2, 'one user reaching the limit must not block another user');

const updatePool = new FakePool([
  { id: 'large', user_id: 3, data_bytes: 70, title: 'Large', data_json: {} },
  { id: 'small', user_id: 3, data_bytes: 20, title: 'Small', data_json: {} },
]);
const replacementData = { payload: 'x'.repeat(35) };
const replacementBytes = serializeProjectData(replacementData).bytes;
await assert.rejects(
  updateProjectWithQuota({
    pool: updatePool,
    userId: 3,
    projectId: 'large',
    title: 'Too large',
    data: replacementData,
    limits: { maxProjects: 10, maxStorageBytes: 90 - 70 + replacementBytes - 1 },
  }),
  (error) => error instanceof ProjectQuotaError && error.code === 'storage_quota_exceeded',
);
assert.equal(updatePool.projects.find((project) => project.id === 'large').data_bytes, 70, 'rejected update must preserve the old project');

const smaller = await updateProjectWithQuota({
  pool: updatePool,
  userId: 3,
  projectId: 'large',
  title: 'Smaller',
  data: { payload: 'ok' },
  limits: { maxProjects: 10, maxStorageBytes: 90 },
});
assert.ok(smaller.quota.storageBytes < 90);
assert.equal(updatePool.projects.find((project) => project.id === 'large').title, 'Smaller');

await assert.rejects(
  updateProjectWithQuota({
    pool: updatePool,
    userId: 3,
    projectId: 'missing',
    title: 'Missing',
    data: {},
    limits: { maxProjects: 10, maxStorageBytes: 90 },
  }),
  (error) => error instanceof ProjectNotFoundError && error.status === 404,
);
assert.equal(updatePool.releaseCount, 3, 'every transaction must release its database client');

const serverSource = readFileSync(resolve(process.cwd(), 'server.js'), 'utf8');
assert.match(serverSource, /ADD COLUMN IF NOT EXISTS data_bytes BIGINT NOT NULL DEFAULT 0/);
assert.match(serverSource, /createProjectWithQuota\(/);
assert.match(serverSource, /updateProjectWithQuota\(/);
assert.match(serverSource, /ProjectQuotaError/);
assert.match(serverSource, /MAX_PROJECTS_PER_USER/);
assert.match(serverSource, /MAX_USER_STORAGE_BYTES/);

console.log('per-user project quota checks passed');
