import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/editor/collagePresetCatalog.js';
let source = readFileSync(path, 'utf8');

function replaceOnce(before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Missing patch target: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`Patch target is not unique: ${label}`);
  source = source.replace(before, after);
}

replaceOnce(
  "import { MIN_FRAME, clamp } from './layout.js';\n",
  "import { MIN_FRAME, clamp } from './layout.js';\nimport { EXTENDED_COLLAGE_PRESETS } from './collagePresetCatalogExtended.js';\n",
  'extended preset import',
);

replaceOnce(
  "  { id: 'magazine', label: 'Журнальные' },\n];",
  "  { id: 'magazine', label: 'Журнальные' },\n  { id: 'text', label: 'С текстом' },\n];",
  'text category',
);

replaceOnce(
  'export const COLLAGE_PRESET_COUNTS = [3, 4, 5, 6];',
  'export const COLLAGE_PRESET_COUNTS = [2, 3, 4, 5, 6, 7, 8, 9];',
  'preset counts',
);

replaceOnce(
  'export const COLLAGE_PRESET_CATALOG = [',
  'const BASE_COLLAGE_PRESET_CATALOG = [',
  'base catalog declaration',
);

replaceOnce(
  '];\n\nexport function collagePresetsFor',
  '];\n\nexport const COLLAGE_PRESET_CATALOG = [\n  ...BASE_COLLAGE_PRESET_CATALOG,\n  ...EXTENDED_COLLAGE_PRESETS,\n];\n\nexport function collagePresetsFor',
  'combined catalog export',
);

writeFileSync(path, source);
console.log('Applied extended collage preset integration');
