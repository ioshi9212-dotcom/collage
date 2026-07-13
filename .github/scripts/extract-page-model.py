import json
from pathlib import Path

app_path = Path('src/AppLive.jsx')
text = app_path.read_text()

old_photo_import = "import { compactProjectPhotos, hydrateProjectPhotos } from './editor/photoStorage';"
new_photo_import = "import { compactProjectPhotos } from './editor/photoStorage';"
if text.count(old_photo_import) != 1:
    raise SystemExit('Expected photoStorage import was not found exactly once')
text = text.replace(old_photo_import, new_photo_import, 1)

old_project_import = "import { prepareEditorProject } from './editor/projectLoad';\n"
new_project_import = """import { prepareEditorProject } from './editor/projectLoad';
import {
  clonePageForDuplicate,
  createBlankPage,
  createInitialAlbum,
  createPage,
  createPageFromTemplate,
  normalizeProjectPages,
  resolvePageFrameCount,
  settingsForPage,
} from './editor/pageModel';
"""
if text.count(old_project_import) != 1:
    raise SystemExit('Expected projectLoad import was not found exactly once')
text = text.replace(old_project_import, new_project_import, 1)

model_start = text.find('function countFramesInLayout(layout) {')
model_end = text.find('function coverRect(image, frame, photo) {', model_start)
if model_start < 0 or model_end < 0:
    raise SystemExit('Could not locate top-level page model helpers')
text = text[:model_start] + text[model_end:]

old_album_state = 'const [album, setAlbum] = useState(initialAlbum);'
new_album_state = 'const [album, setAlbum] = useState(() => createInitialAlbum(DEFAULT_CANVAS, DEFAULT_SETTINGS));'
if text.count(old_album_state) != 1:
    raise SystemExit('Expected initial album state was not found exactly once')
text = text.replace(old_album_state, new_album_state, 1)

runtime_start = text.find('  function runtimePageFromTemplate(page, index) {')
runtime_end = text.find('  function remapTemplateLayers(', runtime_start)
if runtime_start < 0 or runtime_end < 0:
    raise SystemExit('Could not locate runtimePageFromTemplate')
text = text[:runtime_start] + text[runtime_end:]
text = text.replace('runtimePageFromTemplate(', 'createPageFromTemplate(')

normalize_start = text.find('  function normalizePages(data, nextCanvas, nextSettings) {')
normalize_end = text.find('  function applyProjectData(data, message) {', normalize_start)
if normalize_start < 0 or normalize_end < 0:
    raise SystemExit('Could not locate normalizePages')
text = text[:normalize_start] + text[normalize_end:]

normalize_call = 'normalizePages(data, nextCanvas, nextSettings)'
if text.count(normalize_call) != 2:
    raise SystemExit(f'Expected two normalizePages calls, found {text.count(normalize_call)}')
text = text.replace(normalize_call, 'normalizeProjectPages(data, nextCanvas, nextSettings)')

normalize_option = '      normalizePages,\n'
if text.count(normalize_option) != 1:
    raise SystemExit('Expected prepareEditorProject normalizePages option was not found exactly once')
text = text.replace(normalize_option, '      normalizePages: normalizeProjectPages,\n', 1)

for removed in [
    'function countFramesInLayout(',
    'function resolvePageFrameCount(',
    'function settingsForPage(',
    'function createPage(',
    'function createBlankPage(',
    'function clonePageForDuplicate(',
    'function initialAlbum(',
    'function runtimePageFromTemplate(',
    'function normalizePages(',
]:
    if removed in text:
        raise SystemExit(f'Extracted page helper still remains in AppLive: {removed}')

required = [
    "from './editor/pageModel';",
    'createInitialAlbum(DEFAULT_CANVAS, DEFAULT_SETTINGS)',
    'clonePageForDuplicate(currentPage, insertIndex + 1)',
    'createPageFromTemplate(page, index)',
    'normalizeProjectPages(data, nextCanvas, nextSettings)',
    'normalizePages: normalizeProjectPages',
]
for snippet in required:
    if snippet not in text:
        raise SystemExit(f'Expected page model usage is missing: {snippet}')

app_path.write_text(text)

package_path = Path('package.json')
package = json.loads(package_path.read_text())
test_command = package['scripts']['test']
page_test = 'node src/editor/pageModel.test.mjs'
if page_test not in test_command:
    package['scripts']['test'] = f'{test_command} && {page_test}'
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n')
