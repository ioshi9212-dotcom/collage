import json
from pathlib import Path

app_path = Path('src/AppLive.jsx')
text = app_path.read_text()

old_import = "import { prepareEditorProject } from './editor/projectLoad';\n"
new_import = """import { prepareEditorProject } from './editor/projectLoad';
import {
  ALBUM_LAYERS_KEY,
  ALBUM_MODE_KEY,
  createPageLayerDraft,
  deleteExtraLayerPage,
  drawingLayersForPage,
  insertExtraLayerPage,
  normalizeAlbumEditorMode,
  normalizeExtraLayers,
  pruneExtraLayerPages,
  reorderExtraLayerPages,
  textLayersForPage,
} from './editor/extraLayers';
"""
if text.count(old_import) != 1:
    raise SystemExit('Expected projectLoad import was not found exactly once')
text = text.replace(old_import, new_import, 1)

for constant in [
    "const ALBUM_MODE_KEY = 'collage-album-editor-mode';\n",
    "const ALBUM_LAYERS_KEY = 'collage-album-extra-layers-v1';\n",
]:
    if text.count(constant) != 1:
        raise SystemExit(f'Expected local constant was not found exactly once: {constant.strip()}')
    text = text.replace(constant, '', 1)

start = text.find('function normalizeExtraLayers(value) {')
end = text.find('function textFontFamily(item) {')
if start < 0 or end < 0 or end <= start:
    raise SystemExit('Could not locate the top-level extra layer helper block')
text = text[:start] + text[end:]

old_mode_effect = "const next = ['collage', 'text', 'drawings', 'templates'].includes(albumMode) ? albumMode : 'collage';"
if text.count(old_mode_effect) != 1:
    raise SystemExit('Expected album mode effect normalization was not found exactly once')
text = text.replace(old_mode_effect, 'const next = normalizeAlbumEditorMode(albumMode);', 1)

page_draft_start = text.find('  function pageLayerDraft(layers, pageNumber) {')
page_draft_end = text.find('  function setMode(mode) {', page_draft_start)
if page_draft_start < 0 or page_draft_end < 0:
    raise SystemExit('Could not locate pageLayerDraft')
text = text[:page_draft_start] + text[page_draft_end:]

old_set_mode = "const next = ['collage', 'text', 'drawings', 'templates'].includes(mode) ? mode : 'collage';"
if text.count(old_set_mode) != 1:
    raise SystemExit('Expected setMode normalization was not found exactly once')
text = text.replace(old_set_mode, 'const next = normalizeAlbumEditorMode(mode);', 1)

if text.count('pageLayerDraft(') < 2:
    raise SystemExit('Expected pageLayerDraft call sites were not found')
text = text.replace('pageLayerDraft(', 'createPageLayerDraft(')

layer_ops_start = text.find('  function cloneLayerPage(pageLayers) {')
layer_ops_end = text.find('  function reorderPages(fromIndex, toIndex) {', layer_ops_start)
if layer_ops_start < 0 or layer_ops_end < 0:
    raise SystemExit('Could not locate page layer mutation helpers')
layer_wrappers = """  function shiftExtraLayersForPageInsert(insertIndex, oldPageCount, insertedPageLayers = null) {
    updateExtraLayers((layers) => insertExtraLayerPage(layers, insertIndex, oldPageCount, insertedPageLayers, makeId));
  }

  function shiftExtraLayersForPageDelete(deleteIndex, oldPageCount) {
    updateExtraLayers((layers) => deleteExtraLayerPage(layers, deleteIndex, oldPageCount));
  }

  function pruneExtraLayersForPageCount(pageCount) {
    updateExtraLayers((layers) => pruneExtraLayerPages(layers, pageCount));
  }

  function reorderExtraLayersByPageMove(fromIndex, toIndex, pageCount) {
    if (fromIndex === toIndex) return;
    updateExtraLayers((layers) => reorderExtraLayerPages(layers, fromIndex, toIndex, pageCount));
  }


"""
text = text[:layer_ops_start] + layer_wrappers + text[layer_ops_end:]

old_data_mode = "['collage', 'text', 'drawings', 'templates'].includes(data.albumEditorMode) ? data.albumEditorMode : 'collage'"
if text.count(old_data_mode) != 2:
    raise SystemExit(f'Expected two saved/imported album mode normalizations, found {text.count(old_data_mode)}')
text = text.replace(old_data_mode, 'normalizeAlbumEditorMode(data.albumEditorMode)')

for removed in [
    'function normalizeExtraLayers(',
    'function readExtraLayers(',
    'function writeExtraLayers(',
    'function applyAlbumEditorMode(',
    'function textLayersForPage(',
    'function drawingLayersForPage(',
    'function pageLayerDraft(',
    'function cloneLayerPage(',
]:
    if removed in text:
        raise SystemExit(f'Extracted helper still remains in AppLive: {removed}')

required_snippets = [
    "from './editor/extraLayers';",
    'createPageLayerDraft(layers, activePageNumber())',
    'insertExtraLayerPage(layers, insertIndex, oldPageCount, insertedPageLayers, makeId)',
    'deleteExtraLayerPage(layers, deleteIndex, oldPageCount)',
    'pruneExtraLayerPages(layers, pageCount)',
    'reorderExtraLayerPages(layers, fromIndex, toIndex, pageCount)',
]
for snippet in required_snippets:
    if snippet not in text:
        raise SystemExit(f'Expected extracted helper usage is missing: {snippet}')

app_path.write_text(text)

package_path = Path('package.json')
package = json.loads(package_path.read_text())
test_command = package['scripts']['test']
extra_test = 'node src/editor/extraLayers.test.mjs'
if extra_test not in test_command:
    package['scripts']['test'] = f'{test_command} && {extra_test}'
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n')
