import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DRAWINGS_DIR = resolve(ROOT, 'public', 'drawings');
const CATALOG_PATH = resolve(DRAWINGS_DIR, 'catalog.json');
const SUPPORTED_EXTENSIONS = new Set(['.png', '.svg']);

function encodedPublicPath(relativePath) {
  return '/drawings/' + relativePath.split(sep).map((part) => encodeURIComponent(part)).join('/');
}

function prettyName(relativePath) {
  const filename = basename(relativePath, extname(relativePath));
  return filename
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Рисунок';
}

function stableId(relativePath) {
  return 'builtin-' + createHash('sha1').update(relativePath.replaceAll('\\', '/')).digest('hex').slice(0, 16);
}

function pngDimensions(buffer) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (buffer.length < 24 || !signature.every((value, index) => buffer[index] === value)) return null;
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

function svgDimensions(text) {
  const svgTag = text.match(/<svg\b[^>]*>/i)?.[0] || '';
  const widthMatch = svgTag.match(/\bwidth=["']\s*([0-9.]+)/i);
  const heightMatch = svgTag.match(/\bheight=["']\s*([0-9.]+)/i);
  const width = Number.parseFloat(widthMatch?.[1] || '');
  const height = Number.parseFloat(heightMatch?.[1] || '');
  if (width > 0 && height > 0) return { width, height };

  const viewBox = svgTag.match(/\bviewBox=["']\s*([-+0-9.eE]+)[ ,]+([-+0-9.eE]+)[ ,]+([-+0-9.eE]+)[ ,]+([-+0-9.eE]+)\s*["']/i);
  const viewWidth = Number.parseFloat(viewBox?.[3] || '');
  const viewHeight = Number.parseFloat(viewBox?.[4] || '');
  return viewWidth > 0 && viewHeight > 0 ? { width: viewWidth, height: viewHeight } : null;
}

async function dimensionsFor(filePath, extension) {
  if (extension === '.png') return pngDimensions(await readFile(filePath));
  if (extension === '.svg') return svgDimensions(await readFile(filePath, 'utf8'));
  return null;
}

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'catalog.json' || entry.name.startsWith('.')) continue;
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(absolutePath));
    else if (entry.isFile() && SUPPORTED_EXTENSIONS.has(extname(entry.name).toLowerCase())) files.push(absolutePath);
  }
  return files;
}

export async function buildDrawingCatalog() {
  await mkdir(DRAWINGS_DIR, { recursive: true });
  const files = await collectFiles(DRAWINGS_DIR);
  const assets = [];

  for (const filePath of files) {
    const relativePath = relative(DRAWINGS_DIR, filePath);
    const extension = extname(filePath).toLowerCase();
    const dimensions = await dimensionsFor(filePath, extension);
    if (!dimensions) {
      console.warn(`Skipping drawing with unreadable dimensions: ${relativePath}`);
      continue;
    }
    const categoryPath = dirname(relativePath) === '.' ? '' : dirname(relativePath).split(sep).join('/');
    assets.push({
      id: stableId(relativePath),
      name: prettyName(relativePath),
      src: encodedPublicPath(relativePath),
      width: dimensions.width,
      height: dimensions.height,
      builtin: true,
      category: categoryPath,
    });
  }

  assets.sort((left, right) => left.src.localeCompare(right.src, 'ru'));
  const payload = { version: 1, generatedAt: new Date().toISOString(), assets };
  await writeFile(CATALOG_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(`Drawing catalog generated: ${assets.length} asset(s).`);
  return payload;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildDrawingCatalog();
}
