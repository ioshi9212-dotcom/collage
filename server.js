import { createReadStream, existsSync, statSync } from 'node:fs';
import { basename, extname, join, normalize, resolve, sep } from 'node:path';
import { createServer } from 'node:http';
import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const port = Number(process.env.PORT || 3000);
const host = '0.0.0.0';
const distDir = resolve(process.cwd(), 'dist');
const isProduction = process.env.NODE_ENV === 'production';
const configuredSessionSecret = process.env.SESSION_SECRET || '';
const databaseUrl = process.env.DATABASE_URL || '';
const jsonLimitBytes = Number(process.env.JSON_LIMIT_BYTES || 60 * 1024 * 1024);
const publicNoCacheFiles = new Set(['cloud-auth.js', 'cloud-auth.css', 'album-layers.js', 'album-layers.css']);

// In production, SESSION_SECRET is strongly recommended.
// Do not crash the whole Railway service when it is missing: use an ephemeral
// per-boot secret instead. Existing sessions will be logged out after restart,
// but the site stays online and no hardcoded shared production secret is used.
if (isProduction && !configuredSessionSecret) {
  console.warn('WARNING: SESSION_SECRET is missing. Using an ephemeral per-boot session secret. Add SESSION_SECRET in Railway Variables for stable logins.');
}

const effectiveSessionSecret = configuredSessionSecret || (isProduction ? randomBytes(32).toString('hex') : 'collage-dev-secret-change-me');

let pool = null;
let dbReadyPromise = null;

if (databaseUrl) {
  pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED === 'true' },
  });
}

const authAttempts = new Map();
const AUTH_WINDOW_MS = Number(process.env.AUTH_WINDOW_MS || 15 * 60 * 1000);
const AUTH_MAX_ATTEMPTS = Number(process.env.AUTH_MAX_ATTEMPTS || 20);
const AUTH_BLOCK_MS = Number(process.env.AUTH_BLOCK_MS || 15 * 60 * 1000);

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function sendJson(response, status, payload, headers = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  response.end(JSON.stringify(payload));
}

function cacheControlFor(filePath) {
  const extension = extname(filePath).toLowerCase();
  const name = basename(filePath);
  if (extension === '.html' || publicNoCacheFiles.has(name)) return 'no-cache';
  return 'public, max-age=31536000, immutable';
}

function sendFile(response, filePath) {
  const extension = extname(filePath).toLowerCase();
  response.writeHead(200, {
    'Content-Type': mimeTypes[extension] || 'application/octet-stream',
    'Cache-Control': cacheControlFor(filePath),
    'X-Content-Type-Options': 'nosniff',
  });
  createReadStream(filePath).pipe(response);
}

function safeJoin(baseDir, requestedPath) {
  let decodedPath = '';
  try {
    decodedPath = decodeURIComponent(requestedPath.split('?')[0]);
  } catch {
    return null;
  }

  const cleanPath = normalize(decodedPath).replace(/^[/\\]+/, '');
  const resolvedPath = resolve(join(baseDir, cleanPath));
  const baseWithSep = baseDir.endsWith(sep) ? baseDir : `${baseDir}${sep}`;

  if (resolvedPath !== baseDir && !resolvedPath.startsWith(baseWithSep)) return null;
  return resolvedPath;
}

function parseCookies(cookieHeader = '') {
  return Object.fromEntries(
    cookieHeader
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        if (index === -1) return [part, ''];
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function sign(value) {
  return createHmac('sha256', effectiveSessionSecret).update(value).digest('base64url');
}

function makeToken(user) {
  const payload = base64url(JSON.stringify({
    id: user.id,
    email: user.email,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
  }));
  return `${payload}.${sign(payload)}`;
}

function readToken(request) {
  const cookies = parseCookies(request.headers.cookie || '');
  const token = cookies.collage_session;
  if (!token || !token.includes('.')) return null;

  const [payload, signature] = token.split('.');
  const expected = sign(payload);

  try {
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    if (!parsed?.id || !parsed?.email || Date.now() > Number(parsed.exp)) return null;
    return { id: Number(parsed.id), email: String(parsed.email) };
  } catch {
    return null;
  }
}

function sessionCookie(token) {
  const secure = isProduction ? '; Secure' : '';
  return `collage_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}${secure}`;
}

function clearSessionCookie() {
  const secure = isProduction ? '; Secure' : '';
  return `collage_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [method, salt, hash] = String(stored || '').split(':');
  if (method !== 'scrypt' || !salt || !hash) return false;
  const actual = Buffer.from(scryptSync(password, salt, 64).toString('hex'));
  const expected = Buffer.from(hash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function ensureDb() {
  if (!pool) throw new Error('DATABASE_URL is not configured');
  if (!dbReadyPromise) {
    dbReadyPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL DEFAULT 'Без названия',
        data_json JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS projects_user_updated_idx ON projects(user_id, updated_at DESC);
    `);
  }
  await dbReadyPromise;
}

function readBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    let body = '';
    let size = 0;

    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > jsonLimitBytes) {
        rejectBody(new Error('JSON payload is too large'));
        request.destroy();
        return;
      }
      body += chunk;
    });

    request.on('end', () => {
      if (!body) return resolveBody({});
      try {
        resolveBody(JSON.parse(body));
      } catch {
        rejectBody(new Error('Invalid JSON'));
      }
    });

    request.on('error', rejectBody);
  });
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function validateAuthInput(email, password) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Введите нормальный email';
  if (!password || String(password).length < 8) return 'Пароль минимум 8 символов';
  if (String(password).length > 200) return 'Пароль слишком длинный';
  return '';
}

function clientIp(request) {
  const forwarded = String(request.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || request.socket?.remoteAddress || 'unknown';
}

function authRateKey(request, email) {
  return `${clientIp(request)}:${email || 'unknown'}`;
}

function checkAuthRateLimit(request, email) {
  const now = Date.now();
  const key = authRateKey(request, email);
  const current = authAttempts.get(key);

  if (current?.blockedUntil && current.blockedUntil > now) return false;

  if (!current || now - current.firstAt > AUTH_WINDOW_MS) {
    authAttempts.set(key, { firstAt: now, count: 1, blockedUntil: 0 });
    return true;
  }

  current.count += 1;
  if (current.count > AUTH_MAX_ATTEMPTS) {
    current.blockedUntil = now + AUTH_BLOCK_MS;
    return false;
  }

  return true;
}

function clearAuthRateLimit(request, email) {
  authAttempts.delete(authRateKey(request, email));
}

function cleanupAuthAttempts() {
  const now = Date.now();
  for (const [key, value] of authAttempts.entries()) {
    if ((value.blockedUntil && value.blockedUntil < now) || now - value.firstAt > AUTH_WINDOW_MS + AUTH_BLOCK_MS) {
      authAttempts.delete(key);
    }
  }
}

setInterval(cleanupAuthAttempts, 10 * 60 * 1000).unref?.();

async function requireUser(request, response) {
  const user = readToken(request);
  if (!user) {
    sendJson(response, 401, { error: 'not_authenticated' });
    return null;
  }
  return user;
}

async function handleApi(request, response) {
  if (!pool) {
    sendJson(response, 503, {
      error: 'database_not_configured',
      message: 'DATABASE_URL is not configured',
    });
    return true;
  }

  await ensureDb();
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  const path = url.pathname;
  const method = request.method || 'GET';

  if (method === 'GET' && path === '/api/health') {
    sendJson(response, 200, { ok: true, db: Boolean(pool) });
    return true;
  }

  if (method === 'GET' && path === '/api/me') {
    const user = readToken(request);
    sendJson(response, 200, { user });
    return true;
  }

  if (method === 'POST' && path === '/api/auth/logout') {
    sendJson(response, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie() });
    return true;
  }

  if (method === 'POST' && (path === '/api/auth/register' || path === '/api/auth/login')) {
    const body = await readBody(request);
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');
    const error = validateAuthInput(email, password);

    if (error) {
      sendJson(response, 400, { error });
      return true;
    }

    if (!checkAuthRateLimit(request, email)) {
      sendJson(response, 429, { error: 'Слишком много попыток. Попробуй позже.' });
      return true;
    }

    if (path === '/api/auth/register') {
      try {
        const created = await pool.query(
          'INSERT INTO users(email, password_hash) VALUES ($1, $2) RETURNING id, email',
          [email, hashPassword(password)]
        );
        const user = created.rows[0];
        clearAuthRateLimit(request, email);
        sendJson(response, 200, { user }, { 'Set-Cookie': sessionCookie(makeToken(user)) });
      } catch (dbError) {
        if (dbError?.code === '23505') {
          sendJson(response, 409, { error: 'Такой email уже зарегистрирован' });
        } else {
          throw dbError;
        }
      }
      return true;
    }

    const found = await pool.query('SELECT id, email, password_hash FROM users WHERE email = $1', [email]);
    const row = found.rows[0];
    if (!row || !verifyPassword(password, row.password_hash)) {
      sendJson(response, 401, { error: 'Неверный email или пароль' });
      return true;
    }

    const user = { id: row.id, email: row.email };
    clearAuthRateLimit(request, email);
    sendJson(response, 200, { user }, { 'Set-Cookie': sessionCookie(makeToken(user)) });
    return true;
  }

  if (method === 'GET' && path === '/api/projects') {
    const user = await requireUser(request, response);
    if (!user) return true;
    const result = await pool.query(
      'SELECT id, title, created_at, updated_at FROM projects WHERE user_id = $1 ORDER BY updated_at DESC',
      [user.id]
    );
    sendJson(response, 200, { projects: result.rows });
    return true;
  }

  if (method === 'POST' && path === '/api/projects') {
    const user = await requireUser(request, response);
    if (!user) return true;
    const body = await readBody(request);
    const id = randomUUID();
    const title = String(body.title || 'Без названия').trim().slice(0, 120) || 'Без названия';
    const data = body.data || {};
    const result = await pool.query(
      'INSERT INTO projects(id, user_id, title, data_json) VALUES ($1, $2, $3, $4) RETURNING id, title, created_at, updated_at',
      [id, user.id, title, JSON.stringify(data)]
    );
    sendJson(response, 200, { project: result.rows[0] });
    return true;
  }

  const projectMatch = path.match(/^\/api\/projects\/([^/]+)$/);
  if (projectMatch) {
    const user = await requireUser(request, response);
    if (!user) return true;
    const projectId = projectMatch[1];

    if (method === 'GET') {
      const result = await pool.query(
        'SELECT id, title, data_json AS data, created_at, updated_at FROM projects WHERE id = $1 AND user_id = $2',
        [projectId, user.id]
      );
      if (!result.rows[0]) return sendJson(response, 404, { error: 'project_not_found' });
      sendJson(response, 200, { project: result.rows[0] });
      return true;
    }

    if (method === 'PUT') {
      const body = await readBody(request);
      const title = String(body.title || 'Без названия').trim().slice(0, 120) || 'Без названия';
      const data = body.data || {};
      const result = await pool.query(
        'UPDATE projects SET title = $1, data_json = $2, updated_at = NOW() WHERE id = $3 AND user_id = $4 RETURNING id, title, created_at, updated_at',
        [title, JSON.stringify(data), projectId, user.id]
      );
      if (!result.rows[0]) return sendJson(response, 404, { error: 'project_not_found' });
      sendJson(response, 200, { project: result.rows[0] });
      return true;
    }

    if (method === 'DELETE') {
      await pool.query('DELETE FROM projects WHERE id = $1 AND user_id = $2', [projectId, user.id]);
      sendJson(response, 200, { ok: true });
      return true;
    }
  }

  sendJson(response, 404, { error: 'api_not_found' });
  return true;
}

const server = createServer(async (request, response) => {
  try {
    if ((request.url || '').startsWith('/api/')) {
      await handleApi(request, response);
      return;
    }
  } catch (error) {
    console.error(error);
    sendJson(response, 500, {
      error: 'server_error',
      message: isProduction ? 'Server error' : error.message || 'Server error',
    });
    return;
  }

  if (!existsSync(distDir)) {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Build folder not found. Run npm run build first.');
    return;
  }

  const requestedUrl = request.url === '/' ? '/index.html' : request.url || '/index.html';
  const filePath = safeJoin(distDir, requestedUrl);

  try {
    if (filePath && existsSync(filePath) && statSync(filePath).isFile()) {
      sendFile(response, filePath);
      return;
    }
  } catch {
    // Fallback to SPA entry below.
  }

  sendFile(response, join(distDir, 'index.html'));
});

server.listen(port, host, () => {
  console.log(`Collage Creator is running on http://${host}:${port}`);
});
