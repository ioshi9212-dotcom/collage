import { randomUUID } from 'node:crypto';

export const DEFAULT_MAX_USER_PHOTO_BYTES = 500 * 1024 * 1024;
export const DEFAULT_MAX_PHOTO_ASSETS_PER_USER = 500;

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.max(1, Math.floor(number)) : fallback;
}

export function getPhotoAssetLimits(env = process.env) {
  return {
    maxStorageBytes: positiveInteger(
      env.MAX_USER_PHOTO_STORAGE_BYTES,
      DEFAULT_MAX_USER_PHOTO_BYTES,
    ),
    maxAssets: positiveInteger(
      env.MAX_PHOTO_ASSETS_PER_USER,
      DEFAULT_MAX_PHOTO_ASSETS_PER_USER,
    ),
  };
}

export class PhotoAssetQuotaError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'PhotoAssetQuotaError';
    this.code = code;
    this.status = 409;
    this.details = details;
  }
}

export function assertPhotoAssetQuota({
  assetCount,
  storageBytes,
  newAssetBytes,
  limits,
}) {
  const currentAssetCount = Math.max(0, Number(assetCount) || 0);
  const currentStorageBytes = Math.max(0, Number(storageBytes) || 0);
  const requestedBytes = Math.max(0, Number(newAssetBytes) || 0);
  const details = {
    assetCount: currentAssetCount,
    storageBytes: currentStorageBytes,
    maxAssets: limits.maxAssets,
    maxStorageBytes: limits.maxStorageBytes,
    requestedBytes,
    projectedStorageBytes: currentStorageBytes + requestedBytes,
  };

  if (currentAssetCount >= limits.maxAssets) {
    throw new PhotoAssetQuotaError(
      'photo_asset_limit_reached',
      `Достигнут лимит: не больше ${limits.maxAssets} фотографий в аккаунте.`,
      details,
    );
  }

  if (details.projectedStorageBytes > limits.maxStorageBytes) {
    throw new PhotoAssetQuotaError(
      'photo_storage_quota_exceeded',
      'Хранилище фотографий заполнено. Удали ненужные облачные проекты или фотографии.',
      details,
    );
  }

  return {
    assetCount: currentAssetCount + 1,
    storageBytes: details.projectedStorageBytes,
  };
}

export function extractCloudPhotoAssets(value, userId) {
  const prefix = `users/${Number(userId)}/photos/`;
  const assets = new Map();
  const pending = [value];
  const visited = new WeakSet();

  while (pending.length) {
    const current = pending.pop();
    if (!current || typeof current !== 'object') continue;
    if (visited.has(current)) continue;
    visited.add(current);

    const key = String(current.cloudKey || '').replace(/^\/+/, '');
    if (key.startsWith(prefix) && !key.includes('..')) {
      const previous = assets.get(key) || {};
      assets.set(key, {
        key,
        name: String(current.name || previous.name || 'Фото').slice(0, 500),
        type: String(current.type || previous.type || 'application/octet-stream').slice(0, 120),
        size: Math.max(Number(previous.size) || 0, Number(current.size) || 0),
      });
    }

    if (Array.isArray(current)) {
      pending.push(...current);
    } else {
      pending.push(...Object.values(current));
    }
  }

  return [...assets.values()];
}

export function extractCloudPhotoKeys(value, userId) {
  return extractCloudPhotoAssets(value, userId).map((asset) => asset.key);
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

export function createPostgresPhotoAssetStore({ pool, limits = getPhotoAssetLimits() }) {
  if (!pool) throw new Error('A PostgreSQL pool is required for photo asset accounting');

  async function reserve({ id, userId, key, name, type, size }) {
    return withTransaction(pool, async (client) => {
      await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
      const usageResult = await client.query(
        `SELECT COUNT(*)::integer AS asset_count,
                COALESCE(SUM(size_bytes), 0)::bigint AS storage_bytes
           FROM photo_assets
          WHERE user_id = $1 AND status IN ('pending', 'ready')`,
        [userId],
      );
      const usage = usageResult.rows[0] || {};
      const nextUsage = assertPhotoAssetQuota({
        assetCount: usage.asset_count,
        storageBytes: usage.storage_bytes,
        newAssetBytes: size,
        limits,
      });

      await client.query(
        `INSERT INTO photo_assets(
           id, user_id, object_key, name, content_type, size_bytes, status
         ) VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
        [id, userId, key, name, type, size],
      );

      return { ...nextUsage, ...limits };
    });
  }

  async function markReady({ id, userId }) {
    await pool.query(
      `UPDATE photo_assets
          SET status = 'ready', updated_at = NOW()
        WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
  }

  async function release({ id, userId }) {
    await pool.query(
      `DELETE FROM photo_assets
        WHERE id = $1 AND user_id = $2 AND status = 'pending'`,
      [id, userId],
    );
  }

  async function registerLegacy({ userId, key, name, type, size }) {
    await pool.query(
      `INSERT INTO photo_assets(
         id, user_id, object_key, name, content_type, size_bytes, status
       ) VALUES ($1, $2, $3, $4, $5, $6, 'ready')
       ON CONFLICT (object_key) DO UPDATE
         SET content_type = CASE
               WHEN photo_assets.content_type = 'application/octet-stream'
                 THEN EXCLUDED.content_type
               ELSE photo_assets.content_type
             END,
             size_bytes = GREATEST(photo_assets.size_bytes, EXCLUDED.size_bytes),
             updated_at = NOW()
       WHERE photo_assets.user_id = EXCLUDED.user_id`,
      [
        randomUUID(),
        userId,
        key,
        String(name || 'Фото').slice(0, 500),
        String(type || 'application/octet-stream').slice(0, 120),
        Math.max(0, Number(size) || 0),
      ],
    );
  }

  async function registerLegacyBatch({ userId, assets }) {
    const records = [...new Map(
      (assets || []).map((asset) => [asset.key, {
        id: randomUUID(),
        key: String(asset.key || ''),
        name: String(asset.name || 'Фото').slice(0, 500),
        type: String(asset.type || 'application/octet-stream').slice(0, 120),
        size: Math.max(0, Number(asset.size) || 0),
      }]),
    ).values()].filter((asset) => asset.key);
    if (!records.length) return;

    await pool.query(
      `INSERT INTO photo_assets(
         id, user_id, object_key, name, content_type, size_bytes, status
       )
       SELECT item.id, $1, item.object_key, item.name, item.content_type, item.size_bytes, 'ready'
         FROM jsonb_to_recordset($2::jsonb) AS item(
           id text,
           object_key text,
           name text,
           content_type text,
           size_bytes bigint
         )
       ON CONFLICT (object_key) DO NOTHING`,
      [
        userId,
        JSON.stringify(records.map((record) => ({
          id: record.id,
          object_key: record.key,
          name: record.name,
          content_type: record.type,
          size_bytes: record.size,
        }))),
      ],
    );
  }

  async function isReferenced({ userId, key }) {
    const result = await pool.query(
      `SELECT (
         EXISTS(
           SELECT 1
             FROM projects
            WHERE user_id = $1
              AND POSITION($2 IN data_json::text) > 0
         )
         OR EXISTS(
           SELECT 1
             FROM public_albums
            WHERE user_id = $1
              AND POSITION($2 IN data_json::text) > 0
         )
       ) AS referenced`,
      [userId, key],
    );
    return result.rows[0]?.referenced === true;
  }

  async function remove({ userId, key }) {
    await pool.query(
      'DELETE FROM photo_assets WHERE user_id = $1 AND object_key = $2',
      [userId, key],
    );
  }

  async function touchKeys({ userId, keys }) {
    const uniqueKeys = [...new Set(keys || [])];
    if (!uniqueKeys.length) return;
    await pool.query(
      `UPDATE photo_assets
          SET updated_at = NOW()
        WHERE user_id = $1 AND object_key = ANY($2::text[])`,
      [userId, uniqueKeys],
    );
  }

  return {
    reserve,
    markReady,
    release,
    registerLegacy,
    registerLegacyBatch,
    isReferenced,
    remove,
    touchKeys,
    limits,
  };
}
