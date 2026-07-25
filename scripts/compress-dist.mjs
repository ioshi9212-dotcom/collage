import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  constants as zlibConstants,
  brotliCompress,
  gzip,
} from 'node:zlib';

const brotli = promisify(brotliCompress);
const gzipAsync = promisify(gzip);
const distDir = fileURLToPath(new URL('../dist/', import.meta.url));
const compressibleExtensions = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.mjs',
  '.svg',
  '.txt',
  '.xml',
]);
const minimumBytes = 1024;

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

const files = await listFiles(distDir);
let compressed = 0;

for (const filePath of files) {
  if (!compressibleExtensions.has(extname(filePath).toLowerCase())) continue;
  const fileStats = await stat(filePath);
  if (fileStats.size < minimumBytes) continue;

  const source = await readFile(filePath);
  const [brotliOutput, gzipOutput] = await Promise.all([
    brotli(source, {
      params: {
        [zlibConstants.BROTLI_PARAM_QUALITY]: 9,
      },
    }),
    gzipAsync(source, {
      level: zlibConstants.Z_BEST_COMPRESSION,
    }),
  ]);
  await Promise.all([
    writeFile(`${filePath}.br`, brotliOutput),
    writeFile(`${filePath}.gz`, gzipOutput),
  ]);
  compressed += 1;
}

console.log(`Prepared Brotli and gzip variants for ${compressed} static files.`);
