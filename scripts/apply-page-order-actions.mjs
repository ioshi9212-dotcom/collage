import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(source, before, after, label) {
  assert.ok(source.includes(before), `Cannot update ${label}: source pattern not found`);
  return source.replace(before, after);
}

const appPath = 'src/AppLive.jsx';
let app = readFileSync(appPath, 'utf8');

app = replaceOnce(
  app,
  `} from './editor/pageModel';\n`,
  `} from './editor/pageModel';\nimport { movePageOrder, pageNumberToIndex, swapPageOrder } from './editor/pageOrder';\n`,
  'page order import',
);

app = replaceOnce(
  app,
  `  reorderExtraLayerPages,\n  sanitizeExtraLayers,\n`,
  `  reorderExtraLayerPages,\n  sanitizeExtraLayers,\n  swapExtraLayerPages,\n`,
  'extra layer swap import',
);

app = replaceOnce(
  app,
  `function moveArrayItem(items, fromIndex, toIndex) {\n  const next = [...items];\n  const [item] = next.splice(fromIndex, 1);\n  next.splice(toIndex, 0, item);\n  return next;\n}\n\n`,
  '',
  'local move helper removal',
);

app = replaceOnce(
  app,
  `  function reorderExtraLayersByPageMove(fromIndex, toIndex, pageCount) {\n    if (fromIndex === toIndex) return;\n    updateExtraLayers((layers) => reorderExtraLayerPages(layers, fromIndex, toIndex, pageCount));\n  }\n\n`,
  `  function reorderExtraLayersByPageMove(fromIndex, toIndex, pageCount) {\n    if (fromIndex === toIndex) return;\n    updateExtraLayers((layers) => reorderExtraLayerPages(layers, fromIndex, toIndex, pageCount));\n  }\n\n  function swapExtraLayersByPageMove(firstIndex, secondIndex, pageCount) {\n    if (firstIndex === secondIndex) return;\n    updateExtraLayers((layers) => swapExtraLayerPages(layers, firstIndex, secondIndex, pageCount));\n  }\n\n`,
  'extra layer swap wrapper',
);

app = replaceOnce(
  app,
  `      const nextPages = moveArrayItem(current.pages, safeFrom, safeTo);\n`,
  `      const nextPages = movePageOrder(current.pages, safeFrom, safeTo);\n`,
  'page move implementation',
);

app = replaceOnce(
  app,
  `  function startPageDrag(event, index) {\n`,
  `  function swapPagesByIndex(firstIndex, secondIndex) {\n    const safeFirst = Number(firstIndex);\n    const safeSecond = Number(secondIndex);\n    if (!Number.isInteger(safeFirst) || !Number.isInteger(safeSecond)) return;\n    if (safeFirst < 0 || safeSecond < 0 || safeFirst >= pages.length || safeSecond >= pages.length) return;\n    if (safeFirst === safeSecond) {\n      selectPageByIndex(safeFirst);\n      return;\n    }\n\n    swapExtraLayersByPageMove(safeFirst, safeSecond, pages.length);\n\n    const selectedPage = pages[safeFirst];\n    setAlbum((current) => ({\n      ...current,\n      pages: swapPageOrder(current.pages, safeFirst, safeSecond),\n      currentPageId: selectedPage?.id ?? current.currentPageId,\n    }));\n\n    setSelectedFrameId(null);\n    setMoveFrameWithPhotoId(null);\n    setDragPageIndex(null);\n    setDragOverPageIndex(null);\n\n    if (viewMode === 'booklet') {\n      const side = findBookletSideForPage(bookletPlan, safeSecond + 1);\n      setBookletSideId(side?.id ?? null);\n    }\n\n    show(`Страницы ${safeFirst + 1} и ${safeSecond + 1} поменяны местами`);\n  }\n\n  function promptPageOrderTarget(action) {\n    if (!currentPage || currentPageIndex < 0) return;\n    const currentNumber = currentPageIndex + 1;\n    const promptText = action === 'swap'\n      ? `С какой страницей поменять местами страницу ${currentNumber}? Введи номер от 1 до ${pages.length}.`\n      : `На какую позицию переместить страницу ${currentNumber}? Введи номер от 1 до ${pages.length}.`;\n    const rawTarget = window.prompt(promptText, String(currentNumber));\n    if (rawTarget === null) return;\n    const targetIndex = pageNumberToIndex(rawTarget, pages.length);\n    if (targetIndex === null) {\n      show(`Нужен целый номер страницы от 1 до ${pages.length}`);\n      return;\n    }\n    if (targetIndex === currentPageIndex) {\n      show(`Страница ${currentNumber} уже на этом месте`);\n      return;\n    }\n    if (action === 'swap') swapPagesByIndex(currentPageIndex, targetIndex);\n    else reorderPages(currentPageIndex, targetIndex);\n  }\n\n  function startPageDrag(event, index) {\n`,
  'page order actions',
);

app = replaceOnce(
  app,
  `              <button className="button full" onClick={duplicatePage}>Сделать копию</button>\n              <button className="button full danger-button" onClick={deletePage}>Удалить страницу</button>\n`,
  `              <button className="button full" onClick={duplicatePage}>Сделать копию</button>\n              <button className="button full" onClick={() => promptPageOrderTarget('move')}>Переместить на позицию…</button>\n              <button className="button full" onClick={() => promptPageOrderTarget('swap')}>Поменять местами с…</button>\n              <button className="button full danger-button" onClick={deletePage}>Удалить страницу</button>\n`,
  'page order buttons',
);

writeFileSync(appPath, app);

const layersPath = 'src/editor/extraLayers.js';
let layers = readFileSync(layersPath, 'utf8');

layers = replaceOnce(
  layers,
  `export const ALBUM_EDITOR_MODES = ['collage', 'text', 'drawings', 'templates'];\n`,
  `import { moveArrayItem, swapArrayItems } from './pageOrder.js';\n\nexport const ALBUM_EDITOR_MODES = ['collage', 'text', 'drawings', 'templates'];\n`,
  'extra layer page order import',
);

layers = replaceOnce(
  layers,
  `function moveArrayItem(items, fromIndex, toIndex) {\n  const next = [...items];\n  const [item] = next.splice(fromIndex, 1);\n  next.splice(toIndex, 0, item);\n  return next;\n}\n\n`,
  '',
  'extra layer local move helper removal',
);

layers = replaceOnce(
  layers,
  `export function reorderExtraLayerPages(layers, fromIndex, toIndex, pageCount) {\n  if (fromIndex === toIndex) return layers;\n  const pagesMap = layers?.pages ?? {};\n  const orderedLayerPages = Array.from({ length: pageCount }, (_, index) => pagesMap[String(index + 1)] ?? null);\n  const movedLayerPages = moveArrayItem(orderedLayerPages, fromIndex, toIndex);\n  const nextPagesMap = {};\n  movedLayerPages.forEach((pageLayers, index) => {\n    if (pageLayers) nextPagesMap[String(index + 1)] = pageLayers;\n  });\n  for (const [key, value] of Object.entries(pagesMap)) {\n    const numberKey = Number(key);\n    if (!Number.isInteger(numberKey) || numberKey < 1 || numberKey > pageCount) nextPagesMap[key] = value;\n  }\n  return { ...layers, pages: nextPagesMap };\n}\n`,
  `function remapOrderedLayerPages(layers, orderedLayerPages, pageCount) {\n  const pagesMap = layers?.pages ?? {};\n  const nextPagesMap = {};\n  orderedLayerPages.forEach((pageLayers, index) => {\n    if (pageLayers) nextPagesMap[String(index + 1)] = pageLayers;\n  });\n  for (const [key, value] of Object.entries(pagesMap)) {\n    const numberKey = Number(key);\n    if (!Number.isInteger(numberKey) || numberKey < 1 || numberKey > pageCount) nextPagesMap[key] = value;\n  }\n  return { ...layers, pages: nextPagesMap };\n}\n\nfunction orderedLayerPages(layers, pageCount) {\n  const pagesMap = layers?.pages ?? {};\n  return Array.from({ length: pageCount }, (_, index) => pagesMap[String(index + 1)] ?? null);\n}\n\nexport function reorderExtraLayerPages(layers, fromIndex, toIndex, pageCount) {\n  if (fromIndex === toIndex) return layers;\n  const ordered = orderedLayerPages(layers, pageCount);\n  const moved = moveArrayItem(ordered, fromIndex, toIndex);\n  return moved === ordered ? layers : remapOrderedLayerPages(layers, moved, pageCount);\n}\n\nexport function swapExtraLayerPages(layers, firstIndex, secondIndex, pageCount) {\n  if (firstIndex === secondIndex) return layers;\n  const ordered = orderedLayerPages(layers, pageCount);\n  const swapped = swapArrayItems(ordered, firstIndex, secondIndex);\n  return swapped === ordered ? layers : remapOrderedLayerPages(layers, swapped, pageCount);\n}\n`,
  'extra layer move and swap functions',
);

writeFileSync(layersPath, layers);

const layersTestPath = 'src/editor/extraLayers.test.mjs';
let layersTest = readFileSync(layersTestPath, 'utf8');
layersTest = replaceOnce(
  layersTest,
  `  reorderExtraLayerPages,\n  textLayersForPage,\n`,
  `  reorderExtraLayerPages,\n  swapExtraLayerPages,\n  textLayersForPage,\n`,
  'extra layer swap test import',
);

layersTest = replaceOnce(
  layersTest,
  `  assert.equal(reorderExtraLayerPages(baseLayers, 1, 1, 3), baseLayers, 'no-op reorder must preserve the existing state object');\n}\n\nconst appSource`,
  `  assert.equal(reorderExtraLayerPages(baseLayers, 1, 1, 3), baseLayers, 'no-op reorder must preserve the existing state object');\n}\n\n{\n  const swapped = swapExtraLayerPages(baseLayers, 0, 2, 3);\n  assert.equal(swapped.pages[1], baseLayers.pages[3]);\n  assert.equal(swapped.pages[2], baseLayers.pages[2]);\n  assert.equal(swapped.pages[3], baseLayers.pages[1]);\n  assert.equal(swapped.pages.metadata, baseLayers.pages.metadata);\n  assert.equal(swapExtraLayerPages(baseLayers, 2, 2, 3), baseLayers, 'no-op swap must preserve the existing state object');\n}\n\nconst appSource`,
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
writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

const e2ePath = 'e2e/page-order-actions.spec.js';
writeFileSync(e2ePath, `import { expect, test } from '@playwright/test';\nimport { openEditor } from './helpers.mjs';\n\nasync function project(page) {\n  return page.evaluate(() => structuredClone(window.__collageApp.getProject()));\n}\n\ntest('page order actions move and swap the selected page by number', async ({ page }) => {\n  await openEditor(page);\n  await page.locator('.page-rail-add-v3').click();\n  await page.locator('.page-rail-add-v3').click();\n  await page.locator('.page-rail-add-v3').click();\n\n  await expect.poll(async () => (await project(page)).pages.length).toBe(5);\n  await page.locator('.editor-tool-button-v2[aria-label="Страницы"]').click();\n\n  const beforeMove = await project(page);\n  const selectedId = beforeMove.currentPageId;\n  const selectedIndex = beforeMove.pages.findIndex((item) => item.id === selectedId);\n  expect(selectedIndex).toBeGreaterThan(0);\n\n  page.once('dialog', (dialog) => dialog.accept('1'));\n  await page.getByRole('button', { name: 'Переместить на позицию…', exact: true }).click();\n\n  await expect.poll(async () => {\n    const next = await project(page);\n    return { firstId: next.pages[0]?.id, currentPageId: next.currentPageId };\n  }).toEqual({ firstId: selectedId, currentPageId: selectedId });\n\n  const afterMove = await project(page);\n  const targetId = afterMove.pages[2].id;\n  page.once('dialog', (dialog) => dialog.accept('3'));\n  await page.getByRole('button', { name: 'Поменять местами с…', exact: true }).click();\n\n  await expect.poll(async () => {\n    const next = await project(page);\n    return { firstId: next.pages[0]?.id, thirdId: next.pages[2]?.id, currentPageId: next.currentPageId };\n  }).toEqual({ firstId: targetId, thirdId: selectedId, currentPageId: selectedId });\n\n  const finalProject = await project(page);\n  expect(finalProject.pages).toHaveLength(5);\n  expect(new Set(finalProject.pages.map((item) => item.id)).size).toBe(5);\n  expect(finalProject.pages.map((item) => item.title)).toEqual([\n    'Страница 1',\n    'Страница 2',\n    'Страница 3',\n    'Страница 4',\n    'Страница 5',\n  ]);\n});\n`);

console.log('Page order actions migration applied');
