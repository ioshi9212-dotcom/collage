import { existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

function decodeRequestPath(requestUrl) {
  try {
    const rawPath = String(requestUrl || '/').split('?')[0].split('#')[0] || '/';
    const decodedPath = decodeURIComponent(rawPath);
    return decodedPath.includes('\0') ? null : decodedPath;
  } catch {
    return null;
  }
}

export function safeStaticPath(baseDir, requestUrl) {
  const decodedPath = decodeRequestPath(requestUrl);
  if (decodedPath === null) return null;

  const cleanPath = normalize(decodedPath).replace(/^[/\\]+/, '');
  const resolvedPath = resolve(join(baseDir, cleanPath));
  const baseWithSep = baseDir.endsWith(sep) ? baseDir : `${baseDir}${sep}`;

  if (resolvedPath !== baseDir && !resolvedPath.startsWith(baseWithSep)) return null;
  return resolvedPath;
}

function isFile(path, fileExists, fileStat) {
  if (!path || !fileExists(path)) return false;
  try {
    return fileStat(path).isFile();
  } catch {
    return false;
  }
}

export function resolveStaticRequest({
  distDir,
  requestUrl = '/',
  method = 'GET',
  fileExists = existsSync,
  fileStat = statSync,
}) {
  const normalizedMethod = String(method || 'GET').toUpperCase();
  if (normalizedMethod !== 'GET' && normalizedMethod !== 'HEAD') {
    return { kind: 'not_found' };
  }

  const decodedPath = decodeRequestPath(requestUrl === '/' ? '/index.html' : requestUrl);
  if (decodedPath === null) return { kind: 'not_found' };

  const requestedPath = safeStaticPath(distDir, decodedPath);
  if (!requestedPath) return { kind: 'not_found' };

  if (isFile(requestedPath, fileExists, fileStat)) {
    return { kind: 'file', path: requestedPath };
  }

  // A missing URL with a file extension is an asset request, not an SPA route.
  if (extname(decodedPath)) return { kind: 'not_found' };

  const indexPath = join(distDir, 'index.html');
  if (!isFile(indexPath, fileExists, fileStat)) return { kind: 'not_found' };
  return { kind: 'spa', path: indexPath };
}
