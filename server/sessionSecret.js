import { randomBytes } from 'node:crypto';

export const SESSION_SECRET_RECORD_NAME = 'collage-session-signing-v1';
export const MIN_RECOMMENDED_SESSION_SECRET_BYTES = 32;

function secretBytes(value) {
  return Buffer.byteLength(String(value || ''), 'utf8');
}

function generateSecret(randomBytesImpl = randomBytes) {
  return randomBytesImpl(48).toString('base64url');
}

async function readOrCreateDatabaseSecret(pool, generatedSecret) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_secrets (
      name TEXT PRIMARY KEY,
      secret_value TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    'INSERT INTO app_secrets(name, secret_value) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING',
    [SESSION_SECRET_RECORD_NAME, generatedSecret],
  );
  const result = await pool.query(
    'SELECT secret_value FROM app_secrets WHERE name = $1',
    [SESSION_SECRET_RECORD_NAME],
  );
  const secret = String(result.rows?.[0]?.secret_value || '');
  if (!secret) throw new Error('Persistent session secret was not stored');
  return secret;
}

export async function resolveSessionSecret({
  configuredSecret = '',
  pool = null,
  isProduction = false,
  randomBytesImpl = randomBytes,
} = {}) {
  const explicitSecret = String(configuredSecret || '').trim();
  if (explicitSecret) {
    return {
      secret: explicitSecret,
      source: 'environment',
      persistent: true,
      recommendedStrength: secretBytes(explicitSecret) >= MIN_RECOMMENDED_SESSION_SECRET_BYTES,
      error: null,
    };
  }

  const generatedSecret = generateSecret(randomBytesImpl);
  if (pool) {
    try {
      const secret = await readOrCreateDatabaseSecret(pool, generatedSecret);
      return {
        secret,
        source: 'database',
        persistent: true,
        recommendedStrength: secretBytes(secret) >= MIN_RECOMMENDED_SESSION_SECRET_BYTES,
        error: null,
      };
    } catch (error) {
      return {
        secret: isProduction ? generatedSecret : 'collage-dev-secret-change-me',
        source: isProduction ? 'ephemeral' : 'development',
        persistent: !isProduction,
        recommendedStrength: isProduction,
        error,
      };
    }
  }

  return {
    secret: isProduction ? generatedSecret : 'collage-dev-secret-change-me',
    source: isProduction ? 'ephemeral' : 'development',
    persistent: !isProduction,
    recommendedStrength: isProduction,
    error: null,
  };
}

export function describeSessionSecretState(state) {
  if (state.source === 'environment') {
    return state.recommendedStrength
      ? 'SESSION_SECRET loaded from environment.'
      : `WARNING: SESSION_SECRET is shorter than ${MIN_RECOMMENDED_SESSION_SECRET_BYTES} bytes.`;
  }
  if (state.source === 'database') {
    return 'SESSION_SECRET is not set; using a persistent database-backed session key.';
  }
  if (state.source === 'development') {
    return 'Using the fixed development session key.';
  }
  const detail = state.error?.message ? ` Database error: ${state.error.message}` : '';
  return `WARNING: using an ephemeral session key; logins will reset after restart.${detail}`;
}
