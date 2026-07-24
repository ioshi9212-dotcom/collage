import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/AppLive.jsx';
let source = readFileSync(path, 'utf8');

function replaceOnce(before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Missing patch target: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`Patch target is not unique: ${label}`);
  source = source.replace(before, after);
}

replaceOnce(
  "import { addFreeFrameToPage, removeFreeFrameFromPage } from './editor/freeFrameActions';\nimport {",
  "import { addFreeFrameToPage, removeFreeFrameFromPage } from './editor/freeFrameActions';\nimport { hasFrameSnapGuides, snapFramePosition, snapFrameTransformBox } from './editor/frameSnapping';\nimport {",
  'frame snapping import',
);

replaceOnce(
  "  showGuides: true,\n  frameMode: 'free',",
  "  showGuides: true,\n  smartSnap: true,\n  frameMode: 'free',",
  'default smart snap setting',
);

const oldCollageStart = `function CollageFrame({ frame, selected, locked, borderWidth, borderColor, printMode, canvas, pageOffsetX, moveFrameWithPhoto, collagePreviewOnly = false, onSelect, onPhotoMove, onFrameChange, onFrameDragFinish }) {`;
const newCollageStart = `function SmartAlignmentGuides({ guides, canvas }) {
  if (!hasFrameSnapGuides(guides)) return null;
  return (
    <Group listening={false}>
      {(guides.vertical || []).map((x) => (
        <Line
          key={\`smart-v-\${x}\`}
          name="smart-alignment-guide"
          points={[x, 0, x, canvas.height]}
          stroke="#d04f72"
          strokeWidth={3}
          strokeScaleEnabled={false}
          dash={[18, 10]}
          opacity={0.92}
          listening={false}
        />
      ))}
      {(guides.horizontal || []).map((y) => (
        <Line
          key={\`smart-h-\${y}\`}
          name="smart-alignment-guide"
          points={[0, y, canvas.width, y]}
          stroke="#d04f72"
          strokeWidth={3}
          strokeScaleEnabled={false}
          dash={[18, 10]}
          opacity={0.92}
          listening={false}
        />
      ))}
    </Group>
  );
}

function CollageFrame({ frame, selected, locked, borderWidth, borderColor, printMode, canvas, pageOffsetX, moveFrameWithPhoto, snapFrames = [], smartSnap = true, collagePreviewOnly = false, onSelect, onPhotoMove, onFrameChange, onFrameDragFinish, onSnapGuidesChange = () => {} }) {`;
replaceOnce(oldCollageStart, newCollageStart, 'smart guide component and CollageFrame props');

const oldFrameHandlers = `  function clampFrameNode(node) {
    const next = clampFramePosition(frame, canvas, node.x(), node.y());
    node.x(next.x);
    node.y(next.y);
  }

  function commitFrameDrag(event) {
    if (collagePreviewOnly || printMode || !selected || locked) return;
    const node = event.target;
    clampFrameNode(node);
    onFrameChange(frame.id, { x: node.x(), y: node.y() });
    onFrameDragFinish?.();
  }

  function commitTransform() {
    if (collagePreviewOnly || printMode || !selected || locked || !frameRectRef.current) return;
    const node = frameRectRef.current;
    const patch = buildFrameTransformPatch(frame, {
      x: node.x(),
      y: node.y(),
      scaleX: node.scaleX(),
      scaleY: node.scaleY(),
    });
    node.x(0);
    node.y(0);
    node.scaleX(1);
    node.scaleY(1);
    onFrameChange(frame.id, patch);
  }`;

const newFrameHandlers = `  function clearSnapGuides() {
    onSnapGuidesChange(null);
  }

  function clampFrameNode(node) {
    const bounded = clampFramePosition(frame, canvas, node.x(), node.y());
    if (!smartSnap) {
      node.x(bounded.x);
      node.y(bounded.y);
      clearSnapGuides();
      return bounded;
    }
    const snapped = snapFramePosition({
      frame,
      frames: snapFrames,
      canvas,
      x: bounded.x,
      y: bounded.y,
    });
    node.x(snapped.x);
    node.y(snapped.y);
    onSnapGuidesChange(hasFrameSnapGuides(snapped.guides) ? snapped.guides : null);
    return snapped;
  }

  function commitFrameDrag(event) {
    if (collagePreviewOnly || printMode || !selected || locked) return;
    const node = event.target;
    clampFrameNode(node);
    onFrameChange(frame.id, { x: node.x(), y: node.y() });
    clearSnapGuides();
    onFrameDragFinish?.();
  }

  function commitTransform() {
    if (collagePreviewOnly || printMode || !selected || locked || !frameRectRef.current) return;
    const node = frameRectRef.current;
    const patch = buildFrameTransformPatch(frame, {
      x: node.x(),
      y: node.y(),
      scaleX: node.scaleX(),
      scaleY: node.scaleY(),
    });
    node.x(0);
    node.y(0);
    node.scaleX(1);
    node.scaleY(1);
    onFrameChange(frame.id, patch);
    clearSnapGuides();
  }

  function snapTransformBox(oldBox, newBox) {
    const bounded = validateFrameTransformBox(oldBox, newBox, { pageOffsetX, canvas, minFrame: MIN_FRAME });
    if (bounded === oldBox || !smartSnap) {
      if (!smartSnap) clearSnapGuides();
      return bounded;
    }
    const snapped = snapFrameTransformBox({
      frame,
      frames: snapFrames,
      canvas,
      oldBox,
      newBox: bounded,
      pageOffsetX,
      minFrame: MIN_FRAME,
    });
    const validated = validateFrameTransformBox(oldBox, snapped.box, { pageOffsetX, canvas, minFrame: MIN_FRAME });
    onSnapGuidesChange(validated === oldBox || !hasFrameSnapGuides(snapped.guides) ? null : snapped.guides);
    return validated;
  }`;
replaceOnce(oldFrameHandlers, newFrameHandlers, 'drag and resize snapping handlers');

replaceOnce(
  "          boundBoxFunc={(oldBox, newBox) => validateFrameTransformBox(oldBox, newBox, { pageOffsetX, canvas, minFrame: MIN_FRAME })}",
  "          boundBoxFunc={snapTransformBox}",
  'transform snap callback',
);

replaceOnce(
  "function PageLayer({ page, pageIndex, x, y = 0, canvas, settings, activePageId, selectedFrameId, moveFrameWithPhotoId, printMode = false, collagePreviewOnly = false, onFrameSelect, onPhotoMove, onFrameChange, onFrameDragFinish, onColumnResize, onRowResize, onActivatePage }) {",
  "function PageLayer({ page, pageIndex, x, y = 0, canvas, settings, activePageId, selectedFrameId, moveFrameWithPhotoId, snapGuides = null, smartSnap = true, printMode = false, collagePreviewOnly = false, onFrameSelect, onPhotoMove, onFrameChange, onFrameDragFinish, onSnapGuidesChange, onColumnResize, onRowResize, onActivatePage }) {",
  'PageLayer snap props',
);

replaceOnce(
  `          moveFrameWithPhoto={!collagePreviewOnly && !printMode && frame.id === moveFrameWithPhotoId}
          onSelect={() => !collagePreviewOnly && !printMode && onFrameSelect(page.id, frame.id)}`,
  `          moveFrameWithPhoto={!collagePreviewOnly && !printMode && frame.id === moveFrameWithPhotoId}
          snapFrames={page.frames}
          smartSnap={smartSnap}
          onSnapGuidesChange={(guides) => !collagePreviewOnly && !printMode && onSnapGuidesChange?.(page.id, guides)}
          onSelect={() => !collagePreviewOnly && !printMode && onFrameSelect(page.id, frame.id)}`,
  'CollageFrame snapping props',
);

replaceOnce(
  `      ))}
      {!collagePreviewOnly && !printMode && locked && page.layout && (`,
  `      ))}
      {!collagePreviewOnly && !printMode && !locked && smartSnap && <SmartAlignmentGuides guides={snapGuides} canvas={canvas} />}
      {!collagePreviewOnly && !printMode && locked && page.layout && (`,
  'render smart guide lines',
);

replaceOnce(
  "  const [moveFrameWithPhotoId, setMoveFrameWithPhotoId] = useState(null);\n  const [viewMode, setViewMode] = useState('spread');",
  "  const [moveFrameWithPhotoId, setMoveFrameWithPhotoId] = useState(null);\n  const [frameSnapGuides, setFrameSnapGuides] = useState(null);\n  const [viewMode, setViewMode] = useState('spread');",
  'smart guide state',
);

replaceOnce(
  `  function changeFrame(pageId, frameId, patch) {
    updatePageFrames(pageId, (frames) => updateFrameGeometry(frames, frameId, patch, canvas));
  }`,
  `  function changeFrame(pageId, frameId, patch) {
    updatePageFrames(pageId, (frames) => updateFrameGeometry(frames, frameId, patch, canvas));
  }

  function updateFrameSnapGuides(pageId, guides) {
    setFrameSnapGuides(hasFrameSnapGuides(guides) ? { pageId, ...guides } : null);
  }`,
  'smart guide state updater',
);

replaceOnce(
  `    const next = { ...settings, [key]: value };
    setSettings(next);

    if (key === 'showGuides' || key === 'borderColor' || key === 'borderWidth' || PRINT_ONLY_SETTING_KEYS.has(key)) return;

    if (key === 'frameMode') {
      setMoveFrameWithPhotoId(null);`,
  `    const next = { ...settings, [key]: value };
    setSettings(next);

    if (key === 'smartSnap' && !value) setFrameSnapGuides(null);
    if (key === 'showGuides' || key === 'smartSnap' || key === 'borderColor' || key === 'borderWidth' || PRINT_ONLY_SETTING_KEYS.has(key)) return;

    if (key === 'frameMode') {
      setMoveFrameWithPhotoId(null);
      setFrameSnapGuides(null);`,
  'smart snap setting behavior',
);

replaceOnce(
  `        selectedFrameId={selectedFrameId}
        moveFrameWithPhotoId={moveFrameWithPhotoId}
        onFrameSelect={selectFrame}`,
  `        selectedFrameId={selectedFrameId}
        moveFrameWithPhotoId={moveFrameWithPhotoId}
        snapGuides={frameSnapGuides?.pageId === entry.page?.id ? frameSnapGuides : null}
        smartSnap={settings.smartSnap !== false}
        onFrameSelect={selectFrame}`,
  'render entry snap state',
);

replaceOnce(
  `        onFrameChange={changeFrame}
        onFrameDragFinish={() => setMoveFrameWithPhotoId(null)}
        onColumnResize={resizeGridColumn}`,
  `        onFrameChange={changeFrame}
        onFrameDragFinish={() => setMoveFrameWithPhotoId(null)}
        onSnapGuidesChange={updateFrameSnapGuides}
        onColumnResize={resizeGridColumn}`,
  'render entry snap callback',
);

replaceOnce(
  `    moveFrameWithPhotoId: null,
    printMode: true,`,
  `    moveFrameWithPhotoId: null,
    snapGuides: null,
    smartSnap: false,
    printMode: true,`,
  'print layer smart snap props',
);

replaceOnce(
  `    onFrameChange: () => {},
    onFrameDragFinish: () => {},
    onColumnResize: () => {},`,
  `    onFrameChange: () => {},
    onFrameDragFinish: () => {},
    onSnapGuidesChange: () => {},
    onColumnResize: () => {},`,
  'print layer snap callback',
);

replaceOnce(
  `              <button className={\`button full \${locked ? 'active-mode' : ''}\`} onClick={() => updateSetting('frameMode', locked ? 'free' : 'locked')}>{locked ? 'Сетка окон включена' : 'Свободные окна'}</button>
              <button className="button full" onClick={() => rebuildPage(album.currentPageId, canvas, settings)}>Перестроить рамки</button>`,
  `              <button className={\`button full \${locked ? 'active-mode' : ''}\`} onClick={() => updateSetting('frameMode', locked ? 'free' : 'locked')}>{locked ? 'Сетка окон включена' : 'Свободные окна'}</button>
              <button className={\`button full \${settings.smartSnap !== false ? 'active-mode' : ''}\`} onClick={() => updateSetting('smartSnap', settings.smartSnap === false)} disabled={locked}>Умная привязка</button>
              <p className="hint">При движении и изменении размера края и центры окон мягко прилипают друг к другу. Розовая линия показывает выравнивание.</p>
              <button className="button full" onClick={() => rebuildPage(album.currentPageId, canvas, settings)}>Перестроить рамки</button>`,
  'smart snap control',
);

replaceOnce(
  `: 'Свободный режим: окна можно двигать внутри страницы и менять размер за маркеры. Фото внутри можно двигать.'}`,
  `: 'Свободный режим: окна можно двигать и менять размер. Умная привязка выравнивает края и центры, розовая линия показывает совпадение.'}`,
  'toolbar smart snap hint',
);

replaceOnce(
  `onMouseDown={(event) => { if (event.target === event.target.getStage() || event.target.name() === 'background') { setSelectedFrameId(null); setMoveFrameWithPhotoId(null); setSelectedTextId(null); setSelectedDrawingId(null); } }}`,
  `onMouseDown={(event) => { if (event.target === event.target.getStage() || event.target.name() === 'background') { setSelectedFrameId(null); setMoveFrameWithPhotoId(null); setFrameSnapGuides(null); setSelectedTextId(null); setSelectedDrawingId(null); } }}`,
  'clear smart guides on stage background',
);

writeFileSync(path, source);
console.log('Applied smart frame snapping patch');
