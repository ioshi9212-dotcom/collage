import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function file(path) {
  return resolve(root, path);
}

function read(path) {
  return readFileSync(file(path), 'utf8');
}

function write(path, content) {
  writeFileSync(file(path), content, 'utf8');
}

function removeRange(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`${label}: start marker not found`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`${label}: end marker not found`);
  return source.slice(0, start) + source.slice(end);
}

function replaceExactly(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  return source.replace(before, after);
}

let app = read('src/AppLive.jsx');

app = removeRange(
  app,
  '\n      <section className={`album-bar clean-control-panel top-control-card ${isBooklet ? \'booklet-mode-bar\' : \'\'}`}>',
  '\n\n      {!isBooklet && (\n        <section className="album-tool-panel react-mode-panel">',
  'legacy album bar',
);

app = removeRange(
  app,
  '\n\n      {!isBooklet && (\n        <section className="album-tool-panel react-mode-panel">',
  '\n\n      <section className="workspace editor-workspace-v2">',
  'legacy mode tool panel',
);

app = removeRange(
  app,
  '\n\n        {albumMode !== \'collage\' && !isBooklet && (\n          <aside className="album-mode-sidebar">',
  '\n\n        <aside className={`page-rail',
  'legacy mode sidebar',
);

for (const className of ['album-bar', 'album-tool-panel', 'album-mode-sidebar']) {
  if (app.includes(className)) throw new Error(`AppLive still contains ${className}`);
}
write('src/AppLive.jsx', app);

let main = read('src/main.jsx');
main = replaceExactly(
  main,
  "import { installLegacyControlIsolation } from './editor/legacyControlIsolation';\n",
  '',
  'legacy isolation import',
);
main = replaceExactly(
  main,
  'installLegacyControlIsolation();\n',
  '',
  'legacy isolation installation',
);
write('src/main.jsx', main);

let stage2Css = read('src/editor-shell-stage2-deduplicate.css');
stage2Css = replaceExactly(
  stage2Css,
  `/* Deprecated top stacks remain in JSX for now, but must never reappear. */\n.album-bar,\n.album-bar.clean-control-panel,\n.album-tool-panel,\n.react-mode-panel,\n.editor-workspace-v2 > .album-mode-sidebar {\n  display: none !important;\n}\n\n`,
  `/* The deprecated top stack and duplicate mode sidebars were removed from JSX. */\n\n`,
  'stage 2 legacy root CSS',
);
write('src/editor-shell-stage2-deduplicate.css', stage2Css);

const testReplacements = [
  ['e2e/editor-regression-smoke.spec.js', [
    ["    await expect(page.locator('.album-bar')).toBeHidden();\n    await expect(page.locator('.album-mode-sidebar')).toBeHidden();", "    await expect(page.locator('.album-bar')).toHaveCount(0);\n    await expect(page.locator('.album-tool-panel')).toHaveCount(0);\n    await expect(page.locator('.album-mode-sidebar')).toHaveCount(0);"],
  ]],
  ['e2e/editor-shell-v3.spec.js', [
    ["    await expect(page.locator('.album-bar')).toBeHidden();", "    await expect(page.locator('.album-bar')).toHaveCount(0);\n    await expect(page.locator('.album-tool-panel')).toHaveCount(0);\n    await expect(page.locator('.album-mode-sidebar')).toHaveCount(0);"],
  ]],
  ['e2e/editor-shell-stage2-deduplicate.spec.js', [
    ["    await expect(page.locator('.album-bar')).toBeHidden();\n    await expect(page.locator('.album-tool-panel')).toBeHidden();\n    await expect(page.locator('.album-mode-sidebar')).toBeHidden();", "    await expect(page.locator('.album-bar')).toHaveCount(0);\n    await expect(page.locator('.album-tool-panel')).toHaveCount(0);\n    await expect(page.locator('.album-mode-sidebar')).toHaveCount(0);"],
    ["    await expect(page.locator('.album-mode-sidebar')).toBeHidden();", "    await expect(page.locator('.album-mode-sidebar')).toHaveCount(0);"],
  ]],
];

for (const [path, replacements] of testReplacements) {
  let content = read(path);
  for (const [before, after] of replacements) {
    content = replaceExactly(content, before, after, `${path} expectation`);
  }
  write(path, content);
}

write('e2e/legacy-shell-removed.spec.js', `import { expect, test } from '@playwright/test';\n\nasync function openEditor(page) {\n  await page.setViewportSize({ width: 1640, height: 900 });\n  await page.goto('/');\n  await page.waitForFunction(() => typeof window.__collageApp?.getProject === 'function');\n}\n\ntest.describe('legacy editor shell removal', () => {\n  test('does not render or install the retired editor shell', async ({ page }) => {\n    await openEditor(page);\n\n    await expect(page.locator('.album-bar')).toHaveCount(0);\n    await expect(page.locator('.album-tool-panel')).toHaveCount(0);\n    await expect(page.locator('.album-mode-sidebar')).toHaveCount(0);\n    expect(await page.evaluate(() => typeof window.__collageLegacyControls)).toBe('undefined');\n  });\n\n  test('keeps every booklet control in the current page inspector', async ({ page }) => {\n    await openEditor(page);\n    await page.getByRole('button', { name: 'Брошюра', exact: true }).click();\n\n    await expect(page.getByRole('heading', { name: 'Настройки брошюры', exact: true })).toBeVisible();\n    await expect(page.getByLabel('Листов в блоке')).toBeVisible();\n    await expect(page.getByLabel('Порядок оборотов')).toBeVisible();\n    await expect(page.getByLabel('Развернуть обороты на 180°')).toBeVisible();\n    await expect(page.getByText('Печатать линию сгиба', { exact: true })).toBeVisible();\n    await expect(page.getByText('Толщина бумаги, мм', { exact: true })).toBeVisible();\n\n    await page.getByText('Экспорт брошюры', { exact: true }).click();\n    for (const label of [\n      'PDF лицевых A4',\n      'PDF оборотов A4',\n      'PDF вся брошюра A4',\n      'Тест первого листа',\n      'Инструкция',\n      'PNG текущей стороны',\n      'PNG всех сторон',\n      'Пакет печати ZIP',\n    ]) {\n      await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(1);\n    }\n  });\n});\n`);

for (const path of [
  'src/editor/legacyControlIsolation.js',
  'e2e/legacy-control-isolation.spec.js',
]) {
  if (!existsSync(file(path))) throw new Error(`Expected legacy file is missing before cleanup: ${path}`);
  unlinkSync(file(path));
}

// Remove this one-shot machinery from the resulting commit.
for (const path of [
  'tools/apply-legacy-editor-shell-cleanup.mjs',
  '.github/workflows/apply-legacy-editor-shell-cleanup.yml',
]) {
  if (existsSync(file(path))) unlinkSync(file(path));
}

console.log('Legacy editor shell markup and isolation removed successfully.');
