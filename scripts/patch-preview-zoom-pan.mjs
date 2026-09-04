import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(source, before, after, label) {
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`Missing patch anchor: ${label}`);
  if (source.indexOf(before, index + before.length) >= 0) throw new Error(`Patch anchor is not unique: ${label}`);
  return source.slice(0, index) + after + source.slice(index + before.length);
}

const appPath = 'src/AppLive.jsx';
let app = readFileSync(appPath, 'utf8');

app = replaceOnce(app,
  "  const [previewViewport, setPreviewViewport] = useState({ width: 1220, height: 720 });\n  const [exportMenuOpen, setExportMenuOpen] = useState(false);",
  "  const [previewViewport, setPreviewViewport] = useState({ width: 1220, height: 720 });\n  const [previewZoom, setPreviewZoom] = useState(1);\n  const [previewPanMode, setPreviewPanMode] = useState(false);\n  const previewPanDragRef = useRef(null);\n  const [exportMenuOpen, setExportMenuOpen] = useState(false);",
  'preview state');

app = replaceOnce(app,
  "  const previewScale = getPreviewScale({\n    stageWidth: stageRealWidth,\n    stageHeight: stageRealHeight,\n    viewportWidth: previewViewport.width,\n    viewportHeight: previewViewport.height,\n  });\n  const stageDisplayWidth = stageRealWidth * previewScale;\n  const stageDisplayHeight = stageRealHeight * previewScale;",
  "  const fitPreviewScale = getPreviewScale({\n    stageWidth: stageRealWidth,\n    stageHeight: stageRealHeight,\n    viewportWidth: previewViewport.width,\n    viewportHeight: previewViewport.height,\n  });\n  const previewScale = fitPreviewScale * previewZoom;\n  const stageDisplayWidth = stageRealWidth * previewScale;\n  const stageDisplayHeight = stageRealHeight * previewScale;\n\n  function setPreviewZoomClamped(value) {\n    const next = Math.max(0.5, Math.min(3, Math.round(Number(value) * 4) / 4));\n    setPreviewZoom(next);\n    if (next <= 1) setPreviewPanMode(false);\n  }\n\n  function beginPreviewPan(event) {\n    if (!previewPanMode || event.button !== 0) return;\n    if (event.target?.closest?.('.canvas-toolbar')) return;\n    const node = canvasAreaRef.current;\n    if (!node) return;\n    event.preventDefault();\n    event.stopPropagation();\n    previewPanDragRef.current = {\n      pointerId: event.pointerId,\n      clientX: event.clientX,\n      clientY: event.clientY,\n      scrollLeft: node.scrollLeft,\n      scrollTop: node.scrollTop,\n    };\n    node.setPointerCapture?.(event.pointerId);\n  }\n\n  function movePreviewPan(event) {\n    const drag = previewPanDragRef.current;\n    const node = canvasAreaRef.current;\n    if (!drag || !node || drag.pointerId !== event.pointerId) return;\n    event.preventDefault();\n    node.scrollLeft = drag.scrollLeft - (event.clientX - drag.clientX);\n    node.scrollTop = drag.scrollTop - (event.clientY - drag.clientY);\n  }\n\n  function endPreviewPan(event) {\n    const drag = previewPanDragRef.current;\n    const node = canvasAreaRef.current;\n    if (!drag || drag.pointerId !== event.pointerId) return;\n    previewPanDragRef.current = null;\n    node?.releasePointerCapture?.(event.pointerId);\n  }",
  'preview scale and pan');

app = replaceOnce(app,
  "        <section ref={canvasAreaRef} className={`canvas-area ${isSpread || isBooklet ? 'album-mode' : ''} ${isBooklet ? 'booklet-canvas-area' : ''}`} style={{ '--stage-display-width': `${stageDisplayWidth}px`, '--stage-display-height': `${stageDisplayHeight}px` }}>",
  "        <section\n          ref={canvasAreaRef}\n          className={`canvas-area ${isSpread || isBooklet ? 'album-mode' : ''} ${isBooklet ? 'booklet-canvas-area' : ''} ${previewZoom > 1 ? 'preview-zoomed' : ''} ${previewPanMode ? 'preview-pan-active' : ''}`}\n          style={{ '--stage-display-width': `${stageDisplayWidth}px`, '--stage-display-height': `${stageDisplayHeight}px` }}\n          onPointerDownCapture={beginPreviewPan}\n          onPointerMoveCapture={movePreviewPan}\n          onPointerUpCapture={endPreviewPan}\n          onPointerCancelCapture={endPreviewPan}\n        >",
  'canvas section');

app = replaceOnce(app,
  "            {!isBooklet && <button className=\"small-button\" onClick={() => rebuildPage(album.currentPageId, canvas, settings)}>Перестроить рамки</button>}\n            {!isBooklet && <button className=\"small-button\" onClick={() => { updatePageFrames(album.currentPageId, (frames) => clearAllFramePhotos(frames)); setSelectedFrameId(null); setMoveFrameWithPhotoId(null); }}>Очистить фото</button>}\n          </div>",
  "            <div className=\"preview-zoom-controls\" aria-label=\"Масштаб альбома\">\n              <button className=\"small-button preview-zoom-button\" type=\"button\" onClick={() => setPreviewZoomClamped(previewZoom - 0.25)} disabled={previewZoom <= 0.5} aria-label=\"Уменьшить альбом\">−</button>\n              <button className=\"small-button preview-zoom-value\" type=\"button\" onClick={() => setPreviewZoomClamped(1)} title=\"Вписать альбом\">{Math.round(previewZoom * 100)}%</button>\n              <button className=\"small-button preview-zoom-button\" type=\"button\" onClick={() => setPreviewZoomClamped(previewZoom + 0.25)} disabled={previewZoom >= 3} aria-label=\"Увеличить альбом\">+</button>\n              <button className={`small-button preview-pan-button ${previewPanMode ? 'active-mode' : ''}`} type=\"button\" onClick={() => setPreviewPanMode((current) => !current)} disabled={previewZoom <= 1} title={previewZoom <= 1 ? 'Сначала увеличь альбом' : 'Тяни альбом мышкой'}>✋</button>\n            </div>\n            {!isBooklet && <button className=\"small-button\" onClick={() => rebuildPage(album.currentPageId, canvas, settings)}>Перестроить рамки</button>}\n            {!isBooklet && <button className=\"small-button\" onClick={() => { updatePageFrames(album.currentPageId, (frames) => clearAllFramePhotos(frames)); setSelectedFrameId(null); setMoveFrameWithPhotoId(null); }}>Очистить фото</button>}\n          </div>",
  'zoom controls');

writeFileSync(appPath, app);

const mainPath = 'src/main.jsx';
let main = readFileSync(mainPath, 'utf8');
main = replaceOnce(main,
  "import './album-flip-leaf-surface.css';",
  "import './album-flip-leaf-surface.css';\nimport './desktop-compact-preview.css';",
  'desktop css import');
writeFileSync(mainPath, main);
console.log('Preview zoom/pan patch applied');
