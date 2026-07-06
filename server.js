import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { createServer } from 'node:http';

const port = Number(process.env.PORT || 3000);
const host = '0.0.0.0';
const distDir = resolve(process.cwd(), 'dist');

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
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function sendFile(response, filePath) {
  const extension = extname(filePath).toLowerCase();
  response.writeHead(200, {
    'Content-Type': mimeTypes[extension] || 'application/octet-stream',
    'Cache-Control': extension === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  });

  createReadStream(filePath).pipe(response);
}

function safeJoin(baseDir, requestedPath) {
  const decodedPath = decodeURIComponent(requestedPath.split('?')[0]);
  const cleanPath = normalize(decodedPath).replace(/^[/\\]+/, '');
  const resolvedPath = resolve(join(baseDir, cleanPath));
  const baseWithSep = baseDir.endsWith(sep) ? baseDir : `${baseDir}${sep}`;

  if (resolvedPath !== baseDir && !resolvedPath.startsWith(baseWithSep)) {
    return null;
  }

  return resolvedPath;
}

const server = createServer((request, response) => {
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
