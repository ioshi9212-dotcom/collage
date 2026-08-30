import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const block = (...lines) => lines.join('\n');

function replaceOnce(source, before, after, label) {
  assert.ok(source.includes(before), 'Cannot update ' + label + ': source pattern not found');
  return source.replace(before, after);
}

const appPath = 'src/AppLive.jsx';
let app = readFileSync(appPath, 'utf8');

app = replaceOnce(
  app,
  "} from './editor/pageModel';\n",
  "} from './editor/pageModel';\nimport { movePageOrder, pageNumberToIndex, swapPageOrder } from './editor/pageOrder';\n",
  'page order import',
);

app = replaceOnce(
  app,
  block('  reorderExtraLayerPages,', '  sanitizeExtraLayers,'),
  block('  reorderExtraLayerPages,', '  sanitizeExtraLayers,', '  swapExtraLayerPages,'),
  'extra layer swap import',
);

app = replaceOnce(
  app,
  block(
    'function moveArrayItem(items, fromIndex, toIndex) {',
    '  const next = [...items];',
    '  const [item] = next.splice(fromIndex, 1);',
    '  next.splice(toIndex, 0, item);',
    '  return next;',
    '}',
    '',
  ),
  '',
  'local move helper removal',
);

const reorderLayerWrapper = block(
  '  function reorderExtraLayersByPageMove(fromIndex, toIndex, pageCount) {',
  '    if (fromIndex === toIndex) return;',
  '    updateExtraLayers((layers) => reorderExtraLayerPages(layers, fromIndex, toIndex, pageCount));',
  '  }',
);
app = replaceOnce(
  app,
  reorderLayerWrapper,
  block(
    reorderLayerWrapper,
    '',
    '  function swapExtraLayersByPageMove(firstIndex, secondIndex, pageCount) {',
    '    if (firstIndex === secondIndex) return;',
    '    updateExtraLayers((layers) => swapExtraLayerPages(layers, firstIndex, secondIndex, pageCount));',
    '  }',
  ),
  'extra layer swap wrapper',
);

app = replaceOnce(
  app,
  '      const nextPages = moveArrayItem(current.pages, safeFrom, safeTo);',
  '      const nextPages = movePageOrder(current.pages, safeFrom, safeTo);',
  'page move implementation',
);

const actionBlock = block(
  '  function swapPagesByIndex(firstIndex, secondIndex) {',
  '    const safeFirst = Number(firstIndex);',
  '    const safeSecond = Number(secondIndex);',
  '    if (!Number.isInteger(safeFirst) || !Number.isInteger(safeSecond)) return;',
  '    if (safeFirst < 0 || safeSecond < 0 || safeFirst >= pages.length || safeSecond >= pages.length) return;',
  '    if (safeFirst === safeSecond) {',
  '      selectPageByIndex(safeFirst);',
  '      return;',
  '    }',
  '',
  '    swapExtraLayersByPageMove(safeFirst, safeSecond, pages.length);',
  '',
  '    const selectedPage = pages[safeFirst];',
  '    setAlbum((current) => ({',
  '      ...current,',
  '      pages: swapPageOrder(current.pages, safeFirst, safeSecond),',
  '      currentPageId: selectedPage?.id ?? current.currentPageId,',
  '    }));',
  '',
  '    setSelectedFrameId(null);',
  '    setMoveFrameWithPhotoId(null);',
  '    setDragPageIndex(null);',
  '    setDragOverPageIndex(null);',
  '',
  "    if (viewMode === 'booklet') {",
  '      const side = findBookletSideForPage(bookletPlan, safeSecond + 1);',
  '      setBookletSideId(side?.id ?? null);',
  '    }',
  '',
  "    show('Страницы ' + (safeFirst + 1) + ' и ' + (safeSecond + 1) + ' поменяны местами');",
  '  }',
  '',
  '  function promptPageOrderTarget(action) {',
  '    if (!currentPage || currentPageIndex < 0) return;',
  '    const currentNumber = currentPageIndex + 1;',
  "    const promptText = action === 'swap'",
  "      ? 'С какой страницей поменять местами страницу ' + currentNumber + '? Введи номер от 1 до ' + pages.length + '.'",
  "      : 'На какую позицию переместить страницу ' + currentNumber + '? Введи номер от 1 до ' + pages.length + '.';",
  '    const rawTarget = window.prompt(promptText, String(currentNumber));',
  '    if (rawTarget === null) return;',
  '    const targetIndex = pageNumberToIndex(rawTarget, pages.length);',
  '    if (targetIndex === null) {',
  "      show('Нужен целый номер страницы от 1 до ' + pages.length);",
  '      return;',
  '    }',
  '    if (targetIndex === currentPageIndex) {',
  "      show('Страница ' + currentNumber + ' уже на этом месте');",
  '      return;',
  '    }',
  "    if (action === 'swap') swapPagesByIndex(currentPageIndex, targetIndex);",
  '    else reorderPages(currentPageIndex, targetIndex);',
  '  }',
  '',
);
app = replaceOnce(app, '  function startPageDrag(event, index) {', actionBlock + '  function startPageDrag(event, index) {', 'page order actions');

app = replaceOnce(
  app,
  block(
    '              <button className="button full" onClick={duplicatePage}>Сделать копию</button>',
    '              <button className="button full danger-button" onClick={deletePage}>Удалить страницу</button>',
  ),
  block(
    '              <button className="button full" onClick={duplicatePage}>Сделать копию</button>',
    '              <button className="button full" onClick={() => promptPageOrderTarget(\'move\')}>Переместить на позицию…</button>',
    '              <button className="button full" onClick={() => promptPageOrderTarget(\'swap\')}>Поменять местами с…</button>',
    '              <button className="button full danger-button" onClick={deletePage}>Удалить страницу</button>',
  ),
  'page order buttons',
);

writeFileSync(appPath, app);

const layersPath = 'src/editor/extraLayers.js';
let layers = readFileSync(layersPath, 'utf8');
layers = replaceOnce(
  layers,
  "export const ALBUM_EDITOR_MODES = ['collage', 'text', 'drawings', 'templates'];",
  "import { moveArrayItem, swapArrayItems } from './pageOrder.js';\n\nexport const ALBUM_EDITOR_MODES = ['collage', 'text', 'drawings', 'templates'];",
  'extra layer page order import',
);
layers = replaceOnce(
  layers,
  block(
    'function moveArrayItem(items, fromIndex, toIndex) {',
    '  const next = [...items];',
    '  const [item] = next.splice(fromIndex, 1);',
    '  next.splice(toIndex, 0, item);',
    '  return next;',
    '}',
    '',
  ),
  '',
  'extra layer local move helper removal',
);

const reorderMarker = 'export function reorderExtraLayerPages(';
const reorderStart = layers.indexOf(reorderMarker);
assert.ok(reorderStart >= 0, 'Cannot update extra layer move and swap functions: marker not found');
layers = layers.slice(0, reorderStart) + block(
  'function remapOrderedLayerPages(layers, orderedLayerPages, pageCount) {',
  '  const pagesMap = layers?.pages ?? {};',
  '  const nextPagesMap = {};',
  '  orderedLayerPages.forEach((pageLayers, index) => {',
  '    if (pageLayers) nextPagesMap[String(index + 1)] = pageLayers;',
  '  });',
  '  for (const [key, value] of Object.entries(pagesMap)) {',
  '    const numberKey = Number(key);',
  '    if (!Number.isInteger(numberKey) || numberKey < 1 || numberKey > pageCount) nextPagesMap[key] = value;',
  '  }',
  '  return { ...layers, pages: nextPagesMap };',
  '}',
  '',
  'function orderedLayerPages(layers, pageCount) {',
  '  const pagesMap = layers?.pages ?? {};',
  '  return Array.from({ length: pageCount }, (_, index) => pagesMap[String(index + 1)] ?? null);',
  '}',
  '',
  'export function reorderExtraLayerPages(layers, fromIndex, toIndex, pageCount) {',
  '  if (fromIndex === toIndex) return layers;',
  '  const ordered = orderedLayerPages(layers, pageCount);',
  '  const moved = moveArrayItem(ordered, fromIndex, toIndex);',
  '  return moved === ordered ? layers : remapOrderedLayerPages(layers, moved, pageCount);',
  '}',
  '',
  'export function swapExtraLayerPages(layers, firstIndex, secondIndex, pageCount) {',
  '  if (firstIndex === secondIndex) return layers;',
  '  const ordered = orderedLayerPages(layers, pageCount);',
  '  const swapped = swapArrayItems(ordered, firstIndex, secondIndex);',
  '  return swapped === ordered ? layers : remapOrderedLayerPages(layers, swapped, pageCount);',
  '}',
  '',
);
writeFileSync(layersPath, layers);

const layersTestPath = 'src/editor/extraLayers.test.mjs';
let layersTest = readFileSync(layersTestPath, 'utf8');
layersTest = replaceOnce(
  layersTest,
  block('  reorderExtraLayerPages,', '  textLayersForPage,'),
  block('  reorderExtraLayerPages,', '  swapExtraLayerPages,', '  textLayersForPage,'),
  'extra layer swap test import',
);
layersTest = replaceOnce(
  layersTest,
  "  assert.equal(reorderExtraLayerPages(baseLayers, 1, 1, 3), baseLayers, 'no-op reorder must preserve the existing state object');\n}\n\nconst appSource",
  block(
    "  assert.equal(reorderExtraLayerPages(baseLayers, 1, 1, 3), baseLayers, 'no-op reorder must preserve the existing state object');",
    '}',
    '',
    '{',
    '  const swapped = swapExtraLayerPages(baseLayers, 0, 2, 3);',
    '  assert.equal(swapped.pages[1], baseLayers.pages[3]);',
    '  assert.equal(swapped.pages[2], baseLayers.pages[2]);',
    '  assert.equal(swapped.pages[3], baseLayers.pages[1]);',
    '  assert.equal(swapped.pages.metadata, baseLayers.pages.metadata);',
    "  assert.equal(swapExtraLayerPages(baseLayers, 2, 2, 3), baseLayers, 'no-op swap must preserve the existing state object');",
    '}',
    '',
    'const appSource',
  ),
  'extra layer swap tests',
);
writeFileSync(layersTestPath, layersTest);

const packagePath = 'package.json';
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
if (!packageJson.scripts.test.includes('src/editor/pageOrder.test.mjs')) {
  packageJson.scripts.test = packageJson.scripts.test.replace(
    'node src/editor/pageModel.test.mjs',
    'node src/editor/pageOrder.test.mjs && node src/editor/pageModel.test.mjs',
  );
}
writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');

const e2ePath = 'e2e/page-order-actions.spec.js';
writeFileSync(e2ePath, block(
  "import { expect, test } from '@playwright/test';",
  "import { openEditor } from './helpers.mjs';",
  '',
  'async function project(page) {',
  '  return page.evaluate(() => structuredClone(window.__collageApp.getProject()));',
  '}',
  '',
  "test('page order actions move and swap the selected page by number', async ({ page }) => {",
  '  await openEditor(page);',
  "  await page.locator('.page-rail-add-v3').click();",
  "  await page.locator('.page-rail-add-v3').click();",
  "  await page.locator('.page-rail-add-v3').click();",
  '',
  '  await expect.poll(async () => (await project(page)).pages.length).toBe(5);',
  "  await page.locator('.editor-tool-button-v2[aria-label=\"Страницы\"]').click();",
  '',
  '  const beforeMove = await project(page);',
  '  const selectedId = beforeMove.currentPageId;',
  '  const selectedIndex = beforeMove.pages.findIndex((item) => item.id === selectedId);',
  '  expect(selectedIndex).toBeGreaterThan(0);',
  '',
  "  page.once('dialog', (dialog) => dialog.accept('1'));",
  "  await page.getByRole('button', { name: 'Переместить на позицию…', exact: true }).click();",
  '',
  '  await expect.poll(async () => {',
  '    const next = await project(page);',
  '    return { firstId: next.pages[0]?.id, currentPageId: next.currentPageId };',
  '  }).toEqual({ firstId: selectedId, currentPageId: selectedId });',
  '',
  '  const afterMove = await project(page);',
  '  const targetId = afterMove.pages[2].id;',
  "  page.once('dialog', (dialog) => dialog.accept('3'));",
  "  await page.getByRole('button', { name: 'Поменять местами с…', exact: true }).click();",
  '',
  '  await expect.poll(async () => {',
  '    const next = await project(page);',
  '    return { firstId: next.pages[0]?.id, thirdId: next.pages[2]?.id, currentPageId: next.currentPageId };',
  '  }).toEqual({ firstId: targetId, thirdId: selectedId, currentPageId: selectedId });',
  '',
  '  const finalProject = await project(page);',
  '  expect(finalProject.pages).toHaveLength(5);',
  '  expect(new Set(finalProject.pages.map((item) => item.id)).size).toBe(5);',
  "  expect(finalProject.pages.map((item) => item.title)).toEqual(['Страница 1', 'Страница 2', 'Страница 3', 'Страница 4', 'Страница 5']);",
  '});',
  '',
));

console.log('Page order actions migration applied');
