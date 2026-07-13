import { existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

function decodeRequestPath(requestUrl) {
  try {
    const url = new URL(requestUrl || '/', 'http://localhost');
    return decodeURIComponent(url.pathname);
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

  const requestedPath = safeStaticPath(distDir, requestUrl === '/' ? '/index.html' : requestUrl);
  if (!requestedPath) return { kind: 'not_found' };

  if (isFile(requestedPath, fileExists, fileStat)) {
    return { kind: 'file', path: requestedPath };
  }

  let pathname = '';
  try {
    pathname = new URL(requestUrl || '/', 'http://localhost').pathname;
  } catch {
    return { kind: 'not_found' };
  }

  // A missing URL with a file extension is an asset request, not an SPA route.
  if (extname(pathname)) return { kind: 'not_found' };

  const indexPath = join(distDir, 'index.html');
  if (!isFile(indexPath, fileExists, fileStat)) return { kind: 'not_found' };
  return { kind: 'spa', path: indexPath };
}
