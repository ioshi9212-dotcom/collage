import { readFileSync, writeFileSync } from 'node:fs';

const path = 'server.js';
let source = readFileSync(path, 'utf8');

function replaceOnce(before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Missing patch target: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`Patch target is not unique: ${label}`);
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

replaceOnce(
  "import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';",
  "import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';",
  'crypto import',
);

replaceOnce(
  "import { createPhotoAssetRequestHandler } from './server/bucketGateway.js';",
  "import { createPhotoAssetRequestHandler } from './server/bucketGateway.js';\nimport { describeSessionSecretState, resolveSessionSecret } from './server/sessionSecret.js';",
  'session secret import',
);

replaceOnce(
`const publicNoCacheFiles = new Set(['cloud-auth.js', 'cloud-auth.css', 'album-layers.js', 'album-layers.css']);

// In production, SESSION_SECRET is strongly recommended.
// Do not crash the whole Railway service when it is missing: use an ephemeral
// per-boot secret instead. Existing sessions will be logged out after restart,
// but the site stays online and no hardcoded shared production secret is used.
if (isProduction && !configuredSessionSecret) {
  console.warn('WARNING: SESSION_SECRET is missing. Using an ephemeral per-boot session secret. Add SESSION_SECRET in Railway Variables for stable logins.');
}

const effectiveSessionSecret = configuredSessionSecret || (isProduction ? randomBytes(32).toString('hex') : 'collage-dev-secret-change-me');
const handlePhotoAssetRequest = createPhotoAssetRequestHandler({
  env: process.env,
  sessionSecret: effectiveSessionSecret,
});

let pool = null;
let dbReadyPromise = null;

if (databaseUrl) {
  pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED === 'true' },
  });
}
`,
`const publicNoCacheFiles = new Set(['cloud-auth.js', 'cloud-auth.css', 'album-layers.js', 'album-layers.css']);

let pool = null;
let dbReadyPromise = null;

if (databaseUrl) {
  pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED === 'true' },
  });
}

const sessionSecretState = await resolveSessionSecret({
  configuredSecret: configuredSessionSecret,
  pool,
  isProduction,
});
const sessionSecretMessage = describeSessionSecretState(sessionSecretState);
if (sessionSecretState.source === 'ephemeral' || !sessionSecretState.recommendedStrength) {
  console.warn(sessionSecretMessage);
} else {
  console.info(sessionSecretMessage);
}

const effectiveSessionSecret = sessionSecretState.secret;
const handlePhotoAssetRequest = createPhotoAssetRequestHandler({
  env: process.env,
  sessionSecret: effectiveSessionSecret,
});
`,
  'session secret initialization',
);

replaceOnce(
  "    sendJson(response, 200, { ok: true, db: Boolean(pool) });",
  `    sendJson(response, 200, {
      ok: true,
      db: Boolean(pool),
      auth: {
        sessionPersistent: sessionSecretState.persistent,
        sessionSecretSource: sessionSecretState.source,
        recommendedStrength: sessionSecretState.recommendedStrength,
      },
    });`,
  'health session status',
);

writeFileSync(path, source);
console.log('Persistent session secret patch applied');
