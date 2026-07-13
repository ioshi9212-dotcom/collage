import json
from pathlib import Path

app_path = Path('src/AppLive.jsx')
text = app_path.read_text()

old_layout_import = """import {
  MIN_FRAME,
  buildGridLayout,
  cleanFrame,
  clamp,
  ensureLayout,
  framesFromLayout,
  getColumnHandles,
  getRowHandles,
  resizeColumn,
  resizeRow,
} from './editor/layout';
"""
new_layout_import = """import {
  MIN_FRAME,
  buildGridLayout,
  clamp,
  ensureLayout,
  framesFromLayout,
  getColumnHandles,
  getRowHandles,
  resizeColumn,
  resizeRow,
} from './editor/layout';
"""
if text.count(old_layout_import) != 1:
    raise SystemExit('Expected layout import was not found exactly once')
text = text.replace(old_layout_import, new_layout_import, 1)

page_import = """import {
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
frame_import = """import {
  applyPhotoToFrames,
  bringFrameToFront,
  buildFrameTransformPatch,
  clampFramePosition,
  clampPhotoPosition,
  clearAllFramePhotos,
  clearFramePhoto,
  coverPhotoRect,
  findFrameAtPoint,
  photoOffsetFromPosition,
  removeFrameById,
  updateFrameGeometry,
  updateFramePhoto,
  validateFrameTransformBox,
} from './editor/frameModel';
"""
if text.count(page_import) != 1:
    raise SystemExit('Expected pageModel import was not found exactly once')
text = text.replace(page_import, page_import + frame_import, 1)

geometry_start = text.find('function coverRect(image, frame, photo) {')
geometry_end = text.find('function PhotoImage(', geometry_start)
if geometry_start < 0 or geometry_end < 0:
    raise SystemExit('Could not locate photo geometry helper block')
text = text[:geometry_start] + text[geometry_end:]

replacements = [
    ('const rect = coverRect(image, frame, frame.photo);', 'const rect = coverPhotoRect(image, frame, frame.photo);'),
    ('const next = clampPhoto(rect, frame, event.target.x(), event.target.y());', 'const next = clampPhotoPosition(rect, frame, event.target.x(), event.target.y());'),
    ("""        onPhotoMove(frame.id, {
          offsetX: Math.round(next.x - rect.baseX),
          offsetY: Math.round(next.y - rect.baseY),
        });""", """        onPhotoMove(frame.id, photoOffsetFromPosition(rect, next.x, next.y));"""),
    ("""  function clampFrameNode(node) {
    node.x(clamp(node.x(), 0, Math.max(0, canvas.width - frame.width)));
    node.y(clamp(node.y(), 0, Math.max(0, canvas.height - frame.height)));
  }""", """  function clampFrameNode(node) {
    const next = clampFramePosition(frame, canvas, node.x(), node.y());
    node.x(next.x);
    node.y(next.y);
  }"""),
    ("""    const patch = {
      x: frame.x + node.x(),
      y: frame.y + node.y(),
      width: frame.width * node.scaleX(),
      height: frame.height * node.scaleY(),
    };""", """    const patch = buildFrameTransformPatch(frame, {
      x: node.x(),
      y: node.y(),
      scaleX: node.scaleX(),
      scaleY: node.scaleY(),
    });"""),
    ("""          boundBoxFunc={(oldBox, newBox) => {
            const pageLeft = pageOffsetX;
            const pageRight = pageOffsetX + canvas.width;
            if (newBox.width < MIN_FRAME || newBox.height < MIN_FRAME) return oldBox;
            if (newBox.x < pageLeft || newBox.y < 0) return oldBox;
            if (newBox.x + newBox.width > pageRight || newBox.y + newBox.height > canvas.height) return oldBox;
            return newBox;
          }}""", """          boundBoxFunc={(oldBox, newBox) => validateFrameTransformBox(oldBox, newBox, { pageOffsetX, canvas, minFrame: MIN_FRAME })}"""),
    ("updatePageFrames(pageId, (frames) => frames.map((frame) => (frame.id === frameId ? cleanFrame({ ...frame, ...patch }, canvas) : frame)));", "updatePageFrames(pageId, (frames) => updateFrameGeometry(frames, frameId, patch, canvas));"),
    ("updatePageFrames(pageId, (frames) => frames.map((frame) => (frame.id === frameId ? { ...frame, photo: { id: photo.id, name: photo.name, src: photo.src, zoom: 1, offsetX: 0, offsetY: 0 } } : frame)));", "updatePageFrames(pageId, (frames) => applyPhotoToFrames(frames, frameId, photo));"),
    ("updatePageFrames(pageId, (frames) => frames.map((frame) => (frame.id === frameId && frame.photo ? { ...frame, photo: { ...frame.photo, ...patch } } : frame)));", "updatePageFrames(pageId, (frames) => updateFramePhoto(frames, frameId, patch));"),
    ("const keptFrames = currentPage.frames.filter((frame) => frame.id !== selectedFrame.id);", "const keptFrames = removeFrameById(currentPage.frames, selectedFrame.id);"),
    ("""    const maxZ = Math.max(0, ...(currentPage?.frames ?? []).map((frame) => Number(frame.zIndex) || 0));
    updatePageFrames(album.currentPageId, (frames) => frames.map((frame) => (frame.id === selectedFrame.id ? { ...frame, zIndex: maxZ + 1 } : frame)));""", """    updatePageFrames(album.currentPageId, (frames) => bringFrameToFront(frames, selectedFrame.id));"""),
    ("updatePageFrames(album.currentPageId, (frames) => frames.map((frame) => ({ ...frame, photo: null })))", "updatePageFrames(album.currentPageId, (frames) => clearAllFramePhotos(frames))"),
    ("updatePageFrames(album.currentPageId, (frames) => frames.map((frame) => frame.id === selectedFrame.id ? { ...frame, photo: null } : frame))", "updatePageFrames(album.currentPageId, (frames) => clearFramePhoto(frames, selectedFrame.id))"),
]
for old, new in replacements:
    count = text.count(old)
    if count < 1:
        raise SystemExit(f'Expected replacement target was not found: {old[:100]}')
    text = text.replace(old, new)

old_drop = """    for (const entry of entries) {
      if (!entry.page) continue;
      const x = point.x - entry.x;
      const y = point.y;
      const frame = entry.page.frames.find((item) => x >= item.x && x <= item.x + item.width && y >= item.y && y <= item.y + item.height);
      if (frame) {
        putPhoto(entry.page.id, frame.id, photo);
        return;
      }
    }
    show('Перетащи фото прямо в рамку');"""
new_drop = """    const target = findFrameAtPoint(entries, point);
    if (target) {
      putPhoto(target.pageId, target.frameId, photo);
      return;
    }
    show('Перетащи фото прямо в рамку');"""
if text.count(old_drop) != 1:
    raise SystemExit('Expected dropPhoto frame lookup was not found exactly once')
text = text.replace(old_drop, new_drop, 1)

for removed in [
    'function coverRect(',
    'function clampPhoto(',
    'cleanFrame({ ...frame, ...patch }',
    'const maxZ = Math.max(0, ...(currentPage?.frames',
]:
    if removed in text:
        raise SystemExit(f'Extracted frame logic still remains in AppLive: {removed}')

required = [
    "from './editor/frameModel';",
    'coverPhotoRect(image, frame, frame.photo)',
    'clampPhotoPosition(rect, frame, event.target.x(), event.target.y())',
    'photoOffsetFromPosition(rect, next.x, next.y)',
    'updateFrameGeometry(frames, frameId, patch, canvas)',
    'applyPhotoToFrames(frames, frameId, photo)',
    'findFrameAtPoint(entries, point)',
    'updateFramePhoto(frames, frameId, patch)',
    'clearAllFramePhotos(frames)',
    'clearFramePhoto(frames, selectedFrame.id)',
    'validateFrameTransformBox(oldBox, newBox, { pageOffsetX, canvas, minFrame: MIN_FRAME })',
]
for snippet in required:
    if snippet not in text:
        raise SystemExit(f'Expected frame model usage is missing: {snippet}')

app_path.write_text(text)

package_path = Path('package.json')
package = json.loads(package_path.read_text())
test_command = package['scripts']['test']
frame_test = 'node src/editor/frameModel.test.mjs'
if frame_test not in test_command:
    package['scripts']['test'] = f'{test_command} && {frame_test}'
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n')
