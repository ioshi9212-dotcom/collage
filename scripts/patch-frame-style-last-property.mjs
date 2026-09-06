import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(source, before, after, label) {
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`Missing patch anchor: ${label}`);
  if (source.indexOf(before, index + before.length) >= 0) throw new Error(`Patch anchor is not unique: ${label}`);
  return source.slice(0, index) + after + source.slice(index + before.length);
}

const appPath = 'src/AppLive.jsx';
let app = readFileSync(appPath, 'utf8');

app = replaceOnce(
  app,
  "import {\n  applyFrameStyleToPages,\n  borderDashFor,\n  normalizeFrameStyle,\n} from './editor/frameStyle';",
  "import {\n  applyFrameStylePropertyToPages,\n  applyFrameStyleToPages,\n  borderDashFor,\n  normalizeFrameStyle,\n} from './editor/frameStyle';",
  'frame style import',
);

app = replaceOnce(
  app,
  "const DEFAULT_FRAME_STYLE = {\n  borderStyle: 'none',\n  borderWidth: 0,\n  borderColor: '#ffffff',\n  cornerRadius: 0,\n};",
  "const DEFAULT_FRAME_STYLE = {\n  borderStyle: 'none',\n  borderWidth: 0,\n  borderColor: '#ffffff',\n  cornerRadius: 0,\n};\nconst FRAME_STYLE_PROPERTY_LABELS = {\n  borderStyle: 'вид рамки',\n  borderWidth: 'толщина',\n  borderColor: 'цвет рамки',\n  cornerRadius: 'скругление',\n};",
  'frame style labels',
);

app = replaceOnce(
  app,
  "  const [frameStyleScope, setFrameStyleScope] = useState('frame');\n  const [frameStyleDraft, setFrameStyleDraft] = useState(DEFAULT_FRAME_STYLE);",
  "  const [frameStyleScope, setFrameStyleScope] = useState('frame');\n  const [frameStyleDraft, setFrameStyleDraft] = useState(DEFAULT_FRAME_STYLE);\n  const [lastFrameStyleChange, setLastFrameStyleChange] = useState(null);",
  'last changed frame style state',
);

app = replaceOnce(
  app,
  "  useEffect(() => {\n    if (!selectedFrame) return;\n    setFrameStyleDraft(normalizeFrameStyle(selectedFrame, settings));\n  }, [selectedFrame, settings]);",
  "  useEffect(() => {\n    setLastFrameStyleChange(null);\n    if (!selectedFrame) return;\n    setFrameStyleDraft(normalizeFrameStyle(selectedFrame, settings));\n  }, [selectedFrame, settings]);",
  'reset last changed style on selection sync',
);

app = replaceOnce(
  app,
  "  function updateFrameStyleDraft(key, value) {\n    setFrameStyleDraft((current) => {",
  "  function updateFrameStyleDraft(key, value) {\n    setLastFrameStyleChange(key);\n    setFrameStyleDraft((current) => {",
  'track last changed style',
);

app = replaceOnce(
  app,
  "  function applyFrameStyle() {",
  "  function applyLastFrameStyleToAll() {\n    if (!lastFrameStyleChange) {\n      show('Сначала измени параметр рамки');\n      return;\n    }\n    const property = lastFrameStyleChange;\n    const value = frameStyleDraft[property];\n    setAlbum((current) => ({\n      ...current,\n      pages: applyFrameStylePropertyToPages(current.pages, { property, value }),\n    }));\n    setLastFrameStyleChange(null);\n    show(`Ко всем окнам применено только: ${FRAME_STYLE_PROPERTY_LABELS[property]}`);\n  }\n\n  function applyFrameStyle() {",
  'apply last style property to album',
);

app = replaceOnce(
  app,
  "                <button className=\"button full accent\" onClick={applyFrameStyle} disabled={frameStyleScope === 'frame' && !selectedFrame}>Применить оформление</button>",
  "                <button className=\"button full accent\" onClick={applyFrameStyle} disabled={frameStyleScope === 'frame' && !selectedFrame}>Применить оформление</button>\n                <button\n                  className=\"button full\"\n                  onClick={applyLastFrameStyleToAll}\n                  disabled={!lastFrameStyleChange}\n                  title={lastFrameStyleChange ? `Применить ко всем только: ${FRAME_STYLE_PROPERTY_LABELS[lastFrameStyleChange]}` : 'Сначала измени один параметр рамки'}\n                >\n                  Применить ко всем\n                </button>\n                {lastFrameStyleChange ? <small className=\"hint\">Только: {FRAME_STYLE_PROPERTY_LABELS[lastFrameStyleChange]}</small> : null}",
  'apply to all button',
);

writeFileSync(appPath, app);

const stylePath = 'src/editor/frameStyle.js';
let style = readFileSync(stylePath, 'utf8');

style = replaceOnce(
  style,
  "export const FRAME_STYLE_SCOPES = ['frame', 'page', 'album'];",
  "export const FRAME_STYLE_SCOPES = ['frame', 'page', 'album'];\nexport const FRAME_STYLE_PROPERTIES = ['borderStyle', 'borderWidth', 'borderColor', 'cornerRadius'];",
  'frame style properties',
);

style = replaceOnce(
  style,
  "export function cleanFrameStylePatch(patch) {\n  return normalizeFrameStyle(patch, DEFAULT_STYLE);\n}\n\nexport function applyFrameStyleToPages",
  "export function cleanFrameStylePatch(patch) {\n  return normalizeFrameStyle(patch, DEFAULT_STYLE);\n}\n\nfunction cleanFrameStyleProperty(property, value) {\n  if (property === 'borderStyle') return FRAME_BORDER_STYLES.includes(value) ? value : DEFAULT_STYLE.borderStyle;\n  if (property === 'borderWidth') return Math.max(0, Math.min(80, finiteNumber(value, DEFAULT_STYLE.borderWidth)));\n  if (property === 'borderColor') return cleanColor(value, DEFAULT_STYLE.borderColor);\n  if (property === 'cornerRadius') return Math.max(0, Math.min(500, finiteNumber(value, DEFAULT_STYLE.cornerRadius)));\n  throw new TypeError('Unknown frame style property');\n}\n\nexport function applyFrameStylePropertyToPages(pages, { property, value } = {}) {\n  if (!FRAME_STYLE_PROPERTIES.includes(property)) throw new TypeError('Unknown frame style property');\n  const cleanValue = cleanFrameStyleProperty(property, value);\n  return (Array.isArray(pages) ? pages : []).map((page) => {\n    if (!Array.isArray(page?.frames)) return page;\n    return {\n      ...page,\n      frames: page.frames.map((frame) => ({ ...frame, [property]: cleanValue })),\n    };\n  });\n}\n\nexport function applyFrameStyleToPages",
  'single property album helper',
);

writeFileSync(stylePath, style);

const unitPath = 'src/editor/frameStyle.test.mjs';
let unit = readFileSync(unitPath, 'utf8');
unit = replaceOnce(
  unit,
  "import {\n  applyFrameStyleToPages,\n  borderDashFor,\n  normalizeFrameStyle,\n} from './frameStyle.js';",
  "import {\n  applyFrameStylePropertyToPages,\n  applyFrameStyleToPages,\n  borderDashFor,\n  normalizeFrameStyle,\n} from './frameStyle.js';",
  'unit import',
);
unit += `\n\nconst variedFrames = [\n  { id: 'page-a', frames: [\n    { id: 'one', borderStyle: 'double', borderWidth: 11, borderColor: '#111111', cornerRadius: 5 },\n    { id: 'two', borderStyle: 'none', borderWidth: 0, borderColor: '#222222', cornerRadius: 15 },\n  ] },\n  { id: 'page-b', frames: [\n    { id: 'three', borderStyle: 'dashed', borderWidth: 7, borderColor: '#333333', cornerRadius: 25 },\n  ] },\n];\nconst beforeOtherStyle = variedFrames.flatMap((item) => item.frames).map(({ borderStyle, borderWidth, borderColor }) => ({ borderStyle, borderWidth, borderColor }));\nconst roundedOnly = applyFrameStylePropertyToPages(variedFrames, { property: 'cornerRadius', value: 80 });\nassert.equal(roundedOnly.flatMap((item) => item.frames).every((frame) => frame.cornerRadius === 80), true);\nassert.deepEqual(\n  roundedOnly.flatMap((item) => item.frames).map(({ borderStyle, borderWidth, borderColor }) => ({ borderStyle, borderWidth, borderColor })),\n  beforeOtherStyle,\n  'single-property apply must preserve every other frame style',\n);\nassert.throws(() => applyFrameStylePropertyToPages(variedFrames, { property: 'unknown', value: 1 }), /Unknown frame style property/);\n`;
writeFileSync(unitPath, unit);

const e2ePath = 'e2e/frame-style-controls.spec.js';
let e2e = readFileSync(e2ePath, 'utf8');
e2e += `\n\ntest('apply to all changes only the most recently edited frame style property', async ({ page }) => {\n  await openEditor(page);\n  await clickFirstFrame(page);\n\n  await page.getByLabel('Вид рамки').selectOption('double');\n  await page.getByLabel('Цвет рамки').fill('#5a4038');\n  await page.getByLabel('Толщина').fill('12');\n  await page.getByRole('button', { name: 'Применить оформление', exact: true }).click();\n\n  const before = await page.evaluate(() => window.__collageApp.getProject().pages\n    .flatMap((item) => item.frames)\n    .map((frame) => ({\n      borderStyle: frame.borderStyle ?? null,\n      borderWidth: frame.borderWidth ?? null,\n      borderColor: frame.borderColor ?? null,\n    })));\n\n  await page.getByLabel('Скругление').fill('120');\n  const applyAll = page.getByRole('button', { name: 'Применить ко всем', exact: true });\n  await expect(applyAll).toBeEnabled();\n  await expect(page.getByText('Только: скругление', { exact: true })).toBeVisible();\n  await applyAll.click();\n\n  await expect.poll(() => page.evaluate(() => window.__collageApp.getProject().pages\n    .flatMap((item) => item.frames)\n    .every((frame) => frame.cornerRadius === 120))).toBe(true);\n\n  const after = await page.evaluate(() => window.__collageApp.getProject().pages\n    .flatMap((item) => item.frames)\n    .map((frame) => ({\n      borderStyle: frame.borderStyle ?? null,\n      borderWidth: frame.borderWidth ?? null,\n      borderColor: frame.borderColor ?? null,\n    })));\n  expect(after).toEqual(before);\n  await expect(applyAll).toBeDisabled();\n});\n`;
writeFileSync(e2ePath, e2e);

console.log('Last-frame-style-property apply-all patch applied');
