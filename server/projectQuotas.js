const DEFAULT_MAX_PROJECTS_PER_USER = 25;
const DEFAULT_MAX_USER_STORAGE_BYTES = 500 * 1024 * 1024;

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.max(1, Math.floor(number)) : fallback;
}

export function getProjectQuotaLimits(env = process.env) {
  return {
    maxProjects: positiveInteger(env.MAX_PROJECTS_PER_USER, DEFAULT_MAX_PROJECTS_PER_USER),
    maxStorageBytes: positiveInteger(env.MAX_USER_STORAGE_BYTES, DEFAULT_MAX_USER_STORAGE_BYTES),
  };
}

export class ProjectQuotaError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'ProjectQuotaError';
    this.code = code;
    this.status = 409;
    this.details = details;
  }
}

export class ProjectNotFoundError extends Error {
  constructor() {
    super('Проект не найден');
    this.name = 'ProjectNotFoundError';
    this.code = 'project_not_found';
    this.status = 404;
  }
}

export function serializeProjectData(data) {
  const json = JSON.stringify(data ?? {});
  return {
    json,
    bytes: Buffer.byteLength(json, 'utf8'),
  };
}

function normalizedUsage(projectCount, storageBytes) {
  return {
    projectCount: Math.max(0, Number(projectCount) || 0),
    storageBytes: Math.max(0, Number(storageBytes) || 0),
  };
}

function quotaDetails(usage, limits, requestedBytes, projectedStorageBytes = usage.storageBytes + requestedBytes) {
  return {
    projectCount: usage.projectCount,
    storageBytes: usage.storageBytes,
    maxProjects: limits.maxProjects,
    maxStorageBytes: limits.maxStorageBytes,
    requestedBytes,
    projectedStorageBytes,
  };
}

export function assertCreateProjectQuota({ projectCount, storageBytes, newProjectBytes, limits }) {
  const usage = normalizedUsage(projectCount, storageBytes);
  const requestedBytes = Math.max(0, Number(newProjectBytes) || 0);

  if (usage.projectCount >= limits.maxProjects) {
    throw new ProjectQuotaError(
      'project_limit_reached',
      `Достигнут лимит: не больше ${limits.maxProjects} проектов в аккаунте. Удали ненужный проект или обнови существующий.`,
      quotaDetails(usage, limits, requestedBytes),
    );
  }

  const projectedStorageBytes = usage.storageBytes + requestedBytes;
  if (projectedStorageBytes > limits.maxStorageBytes) {
    throw new ProjectQuotaError(
      'storage_quota_exceeded',
      'Хранилище аккаунта заполнено. Удали ненужные проекты или уменьши количество фотографий.',
      quotaDetails(usage, limits, requestedBytes, projectedStorageBytes),
    );
  }

  return {
    projectCount: usage.projectCount + 1,
    storageBytes: projectedStorageBytes,
  };
}

export function assertUpdateProjectQuota({ projectCount, storageBytes, currentProjectBytes, newProjectBytes, limits }) {
  const usage = normalizedUsage(projectCount, storageBytes);
  const previousBytes = Math.max(0, Number(currentProjectBytes) || 0);
  const requestedBytes = Math.max(0, Number(newProjectBytes) || 0);
  const projectedStorageBytes = Math.max(0, usage.storageBytes - previousBytes + requestedBytes);

  // Accounts that already exceed a newly lowered quota may still save an equal
  // or smaller version, so users always have a path to reduce their usage.
  if (projectedStorageBytes > limits.maxStorageBytes && projectedStorageBytes > usage.storageBytes) {
    throw new ProjectQuotaError(
      'storage_quota_exceeded',
      'Хранилище аккаунта заполнено. Этот проект можно сохранить только после уменьшения его размера или удаления другого проекта.',
      quotaDetails(usage, limits, requestedBytes, projectedStorageBytes),
    );
  }

  return {
    projectCount: usage.projectCount,
    storageBytes: projectedStorageBytes,
  };
}

async function withTransaction(pool, operation) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the original error.
    }
    throw error;
  } finally {
    client.release();
  }
}

async function lockUser(client, userId) {
  await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
}

async function readUsage(client, userId) {
  const result = await client.query(
    'SELECT COUNT(*)::integer AS project_count, COALESCE(SUM(data_bytes), 0)::bigint AS storage_bytes FROM projects WHERE user_id = $1',
    [userId],
  );
  return normalizedUsage(result.rows[0]?.project_count, result.rows[0]?.storage_bytes);
}

export async function createProjectWithQuota({ pool, userId, id, title, data, limits }) {
  const serialized = serializeProjectData(data);

  return withTransaction(pool, async (client) => {
    await lockUser(client, userId);
    const usage = await readUsage(client, userId);
    const nextUsage = assertCreateProjectQuota({
      ...usage,
      newProjectBytes: serialized.bytes,
      limits,
    });

    const result = await client.query(
      'INSERT INTO projects(id, user_id, title, data_json, data_bytes) VALUES ($1, $2, $3, $4::jsonb, $5) RETURNING id, title, created_at, updated_at',
      [id, userId, title, serialized.json, serialized.bytes],
    );

    return { project: result.rows[0], quota: { ...nextUsage, ...limits } };
  });
}

export async function updateProjectWithQuota({ pool, userId, projectId, title, data, limits }) {
  const serialized = serializeProjectData(data);

  return withTransaction(pool, async (client) => {
    await lockUser(client, userId);
    const current = await client.query(
      'SELECT data_bytes FROM projects WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [projectId, userId],
    );
    if (!current.rows[0]) throw new ProjectNotFoundError();

    const usage = await readUsage(client, userId);
    const nextUsage = assertUpdateProjectQuota({
      ...usage,
      currentProjectBytes: current.rows[0].data_bytes,
      newProjectBytes: serialized.bytes,
      limits,
    });

    const result = await client.query(
      'UPDATE projects SET title = $1, data_json = $2::jsonb, data_bytes = $3, updated_at = NOW() WHERE id = $4 AND user_id = $5 RETURNING id, title, created_at, updated_at',
      [title, serialized.json, serialized.bytes, projectId, userId],
    );

    return { project: result.rows[0], quota: { ...nextUsage, ...limits } };
  });
}
