import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/AppLive.jsx';
let source = readFileSync(path, 'utf8');

if (!source.includes("const ALBUM_MODE_KEY = 'collage-album-editor-mode';")) {
  source = source.replace(
    "const STORAGE_KEY = 'collage-creator-album-live-v11-preserve-mode-layout';",
    "const STORAGE_KEY = 'collage-creator-album-live-v11-preserve-mode-layout';\nconst ALBUM_MODE_KEY = 'collage-album-editor-mode';"
  );
}

if (!source.includes('collagePreviewOnly = false')) {
  source = source.replace(
    'function CollageFrame({ frame, selected, locked, borderWidth, borderColor, printMode, canvas, pageOffsetX, moveFrameWithPhoto, onSelect, onPhotoMove, onFrameChange, onFrameDragFinish }) {',
    'function CollageFrame({ frame, selected, locked, borderWidth, borderColor, printMode, canvas, pageOffsetX, moveFrameWithPhoto, collagePreviewOnly = false, onSelect, onPhotoMove, onFrameChange, onFrameDragFinish }) {'
  );

  source = source.replace(
    '  const canDragFrame = !printMode && selected && !locked;\n',
    `  const canDragFrame = !collagePreviewOnly && !printMode && selected && !locked;\n\n  if (collagePreviewOnly) {\n    if (!frame.photo || !rect) return null;\n    return (\n      <Group x={frame.x} y={frame.y} listening={false}>\n        <Group clipX={0} clipY={0} clipWidth={frame.width} clipHeight={frame.height}>\n          <KonvaImage image={image} x={rect.x} y={rect.y} width={rect.width} height={rect.height} />\n        </Group>\n      </Group>\n    );\n  }\n`
  );

  source = source.replace(
    'function PageLayer({ page, pageIndex, x, canvas, settings, activePageId, selectedFrameId, moveFrameWithPhotoId, printMode = false, onFrameSelect, onPhotoMove, onFrameChange, onFrameDragFinish, onColumnResize, onRowResize, onActivatePage }) {',
    'function PageLayer({ page, pageIndex, x, canvas, settings, activePageId, selectedFrameId, moveFrameWithPhotoId, printMode = false, collagePreviewOnly = false, onFrameSelect, onPhotoMove, onFrameChange, onFrameDragFinish, onColumnResize, onRowResize, onActivatePage }) {'
  );

  source = source.replace(
    '!printMode && settings.showGuides &&',
    '!collagePreviewOnly && !printMode && settings.showGuides &&'
  );

  source = source.replace(
    '{!printMode && <Text x={28} y={24}',
    '{!collagePreviewOnly && !printMode && <Text x={28} y={24}'
  );

  source = source.replace(
    'selected={!printMode && page.id === activePageId && frame.id === selectedFrameId}',
    'selected={!collagePreviewOnly && !printMode && page.id === activePageId && frame.id === selectedFrameId}'
  );

  source = source.replace(
    'moveFrameWithPhoto={!printMode && frame.id === moveFrameWithPhotoId}',
    'moveFrameWithPhoto={!collagePreviewOnly && !printMode && frame.id === moveFrameWithPhotoId}'
  );

  source = source.replace(
    'onSelect={() => !printMode && onFrameSelect(page.id, frame.id)}',
    'onSelect={() => !collagePreviewOnly && !printMode && onFrameSelect(page.id, frame.id)}'
  );

  source = source.replace(
    'onPhotoMove={(frameId, patch) => !printMode && onPhotoMove(page.id, frameId, patch)}',
    'onPhotoMove={(frameId, patch) => !collagePreviewOnly && !printMode && onPhotoMove(page.id, frameId, patch)}'
  );

  source = source.replace(
    'onFrameChange={(frameId, patch) => !printMode && onFrameChange(page.id, frameId, patch)}',
    'onFrameChange={(frameId, patch) => !collagePreviewOnly && !printMode && onFrameChange(page.id, frameId, patch)}'
  );

  source = source.replace(
    'onFrameDragFinish={() => !printMode && onFrameDragFinish?.(frame.id)}',
    'onFrameDragFinish={() => !collagePreviewOnly && !printMode && onFrameDragFinish?.(frame.id)}'
  );

  source = source.replace(
    '          onFrameDragFinish={() => !collagePreviewOnly && !printMode && onFrameDragFinish?.(frame.id)}\n        />',
    '          onFrameDragFinish={() => !collagePreviewOnly && !printMode && onFrameDragFinish?.(frame.id)}\n          collagePreviewOnly={collagePreviewOnly}\n        />'
  );

  source = source.replace(
    '{!printMode && locked && (',
    '{!collagePreviewOnly && !printMode && locked && ('
  );
}

if (!source.includes('const [albumMode, setAlbumMode]')) {
  source = source.replace(
    "  const [notice, setNotice] = useState('');\n",
    `  const [notice, setNotice] = useState('');\n  const [albumMode, setAlbumMode] = useState(() => localStorage.getItem(ALBUM_MODE_KEY) || 'collage');\n\n  useEffect(() => {\n    const readAlbumMode = () => {\n      const next = document.body?.dataset?.albumMode || localStorage.getItem(ALBUM_MODE_KEY) || 'collage';\n      setAlbumMode((current) => (current === next ? current : next));\n    };\n    readAlbumMode();\n    const timer = window.setInterval(readAlbumMode, 250);\n    window.addEventListener('storage', readAlbumMode);\n    return () => {\n      window.clearInterval(timer);\n      window.removeEventListener('storage', readAlbumMode);\n    };\n  }, []);\n\n  const collagePreviewOnly = albumMode !== 'collage';\n`
  );
}

if (!source.includes('collagePreviewOnly={collagePreviewOnly}')) {
  source = source.replace(
    'activePageId={album.currentPageId}',
    'activePageId={album.currentPageId}\n                      collagePreviewOnly={collagePreviewOnly}'
  );
}

source = source.replace(
  '{isSpread && settings.showGuides && <Line points={[canvas.width + SPREAD_GAP / 2, 0, canvas.width + SPREAD_GAP / 2, canvas.height]}',
  '{isSpread && !collagePreviewOnly && settings.showGuides && <Line points={[canvas.width + SPREAD_GAP / 2, 0, canvas.width + SPREAD_GAP / 2, canvas.height]}'
);

writeFileSync(path, source);
