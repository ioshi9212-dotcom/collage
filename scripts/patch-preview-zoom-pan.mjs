import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Missing patch anchor: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`Patch anchor is not unique: ${label}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

const path = 'src/AppLive.jsx';
let source = readFileSync(path, 'utf8');

source = replaceOnce(
  source,
  "  const noticeTimerRef = useRef(null);\n  const canvasAreaRef = useRef(null);\n  const photoUploadInFlightRef = useRef(false);",
  "  const noticeTimerRef = useRef(null);\n  const canvasAreaRef = useRef(null);\n  const stageFrameRef = useRef(null);\n  const previewPanDragRef = useRef(null);\n  const photoUploadInFlightRef = useRef(false);",
  'preview refs',
);

source = replaceOnce(
  source,
  "  const [dragPageIndex, setDragPageIndex] = useState(null);\n  const [dragOverPageIndex, setDragOverPageIndex] = useState(null);\n  const [previewViewport, setPreviewViewport] = useState({ width: 1220, height: 720 });\n  const [exportMenuOpen, setExportMenuOpen] = useState(false);",
  "  const [dragPageIndex, setDragPageIndex] = useState(null);\n  const [dragOverPageIndex, setDragOverPageIndex] = useState(null);\n  const [previewViewport, setPreviewViewport] = useState({ width: 1220, height: 720 });\n  const [previewZoom, setPreviewZoom] = useState(1);\n  const [previewPanMode, setPreviewPanMode] = useState(false);\n  const [exportMenuOpen, setExportMenuOpen] = useState(false);",
  'preview state',
);

source = replaceOnce(
  source,
  "  const stageRealHeight = isBooklet ? bookletSheetSize.height : canvas.height;\n  const previewScale = getPreviewScale({\n    stageWidth: stageRealWidth,\n    stageHeight: stageRealHeight,\n    viewportWidth: previewViewport.width,\n    viewportHeight: previewViewport.height,\n  });\n  const stageDisplayWidth = stageRealWidth * previewScale;\n  const stageDisplayHeight = stageRealHeight * previewScale;",
  "  const stageRealHeight = isBooklet ? bookletSheetSize.height : canvas.height;\n  const fitPreviewScale = getPreviewScale({\n    stageWidth: stageRealWidth,\n    stageHeight: stageRealHeight,\n    viewportWidth: previewViewport.width,\n    viewportHeight: previewViewport.height,\n  });\n  const previewScale = fitPreviewScale * previewZoom;\n  const fitStageDisplayWidth = stageRealWidth * fitPreviewScale;\n  const fitStageDisplayHeight = stageRealHeight * fitPreviewScale;\n  const stageDisplayWidth = stageRealWidth * previewScale;\n  const stageDisplayHeight = stageRealHeight * previewScale;\n\n  function applyPreviewZoom(nextValue) {\n    const nextZoom = Math.max(1, Math.min(3, Math.round(Number(nextValue || 1) * 4) / 4));\n    const node = stageFrameRef.current;\n    const currentZoom = Math.max(1, Number(previewZoom) || 1);\n    const centerX = node ? (node.scrollLeft + node.clientWidth / 2) / currentZoom : 0;\n    const centerY = node ? (node.scrollTop + node.clientHeight / 2) / currentZoom : 0;\n\n    setPreviewZoom(nextZoom);\n    if (nextZoom <= 1) setPreviewPanMode(false);\n\n    requestAnimationFrame(() => {\n      const frame = stageFrameRef.current;\n      if (!frame) return;\n      if (nextZoom <= 1) {\n        frame.scrollLeft = 0;\n        frame.scrollTop = 0;\n        return;\n      }\n      frame.scrollLeft = Math.max(0, centerX * nextZoom - frame.clientWidth / 2);\n      frame.scrollTop = Math.max(0, centerY * nextZoom - frame.clientHeight / 2);\n    });\n  }\n\n  function startPreviewPan(event) {\n    if (!previewPanMode || previewZoom <= 1 || event.button !== 0) return;\n    const frame = stageFrameRef.current;\n    if (!frame) return;\n    previewPanDragRef.current = {\n      pointerId: event.pointerId,\n      startX: event.clientX,\n      startY: event.clientY,\n      scrollLeft: frame.scrollLeft,\n      scrollTop: frame.scrollTop,\n    };\n    event.currentTarget.setPointerCapture?.(event.pointerId);\n    event.preventDefault();\n  }\n\n  function movePreviewPan(event) {\n    const drag = previewPanDragRef.current;\n    if (!drag || drag.pointerId !== event.pointerId) return;\n    const frame = stageFrameRef.current;\n    if (!frame) return;\n    frame.scrollLeft = drag.scrollLeft - (event.clientX - drag.startX);\n    frame.scrollTop = drag.scrollTop - (event.clientY - drag.startY);\n    event.preventDefault();\n  }\n\n  function finishPreviewPan(event) {\n    const drag = previewPanDragRef.current;\n    if (!drag || drag.pointerId !== event.pointerId) return;\n    previewPanDragRef.current = null;\n    event.currentTarget.releasePointerCapture?.(event.pointerId);\n  }",
  'preview scale and handlers',
);

source = replaceOnce(
  source,
  "        <section ref={canvasAreaRef} className={`canvas-area ${isSpread || isBooklet ? 'album-mode' : ''} ${isBooklet ? 'booklet-canvas-area' : ''}`} style={{ '--stage-display-width': `${stageDisplayWidth}px`, '--stage-display-height': `${stageDisplayHeight}px` }}>",
  "        <section ref={canvasAreaRef} className={`canvas-area ${isSpread || isBooklet ? 'album-mode' : ''} ${isBooklet ? 'booklet-canvas-area' : ''}`} style={{ '--stage-display-width': `${stageDisplayWidth}px`, '--stage-display-height': `${stageDisplayHeight}px`, '--stage-viewport-width': `${fitStageDisplayWidth}px`, '--stage-viewport-height': `${fitStageDisplayHeight}px` }}>",
  'canvas preview variables',
);

const toolbarAnchor = "            {!isBooklet && <button className=\"small-button\" onClick={() => rebuildPage(album.currentPageId, canvas, settings)}>Перестроить рамки</button>}";
source = replaceOnce(
  source,
  toolbarAnchor,
  "            <div className=\"preview-zoom-controls\" aria-label=\"Масштаб просмотра альбома\">\n              <button type=\"button\" className=\"small-button\" aria-label=\"Уменьшить альбом\" onClick={() => applyPreviewZoom(previewZoom - 0.25)} disabled={previewZoom <= 1}>−</button>\n              <button type=\"button\" className=\"small-button\" aria-label=\"По размеру\" onClick={() => applyPreviewZoom(1)}>По размеру</button>\n              <span className=\"preview-zoom-value\" aria-live=\"polite\">{Math.round(previewZoom * 100)}%</span>\n              <button type=\"button\" className=\"small-button\" aria-label=\"Увеличить альбом\" onClick={() => applyPreviewZoom(previewZoom + 0.25)} disabled={previewZoom >= 3}>+</button>\n              <button type=\"button\" className={`small-button preview-pan-button ${previewPanMode ? 'active-mode' : ''}`} aria-label=\"Двигать просмотр\" aria-pressed={previewPanMode} onClick={() => setPreviewPanMode((value) => !value)} disabled={previewZoom <= 1}>Двигать</button>\n            </div>\n" + toolbarAnchor,
  'preview toolbar controls',
);

const stageStart = "          <div className={`stage-frame ${isSpread || isBooklet ? 'album-preview' : ''} ${isBooklet ? 'booklet-stage' : ''}`} onDragOver={(event) => { if (!isBooklet) event.preventDefault(); }} onDrop={isBooklet ? undefined : dropPhoto}>\n            <div className=\"stage-scale-shell\" style={{ width: stageRealWidth, height: stageRealHeight, transform: `scale(${previewScale})` }}>";
const stageReplacement = "          <div ref={stageFrameRef} className={`stage-frame preview-scroll-enabled ${isSpread || isBooklet ? 'album-preview' : ''} ${isBooklet ? 'booklet-stage' : ''} ${previewPanMode ? 'preview-pan-mode' : ''}`} onPointerDown={startPreviewPan} onPointerMove={movePreviewPan} onPointerUp={finishPreviewPan} onPointerCancel={finishPreviewPan} onDragOver={(event) => { if (!isBooklet && !previewPanMode) event.preventDefault(); }} onDrop={isBooklet || previewPanMode ? undefined : dropPhoto}>\n            <div className=\"stage-pan-surface\" style={{ width: stageDisplayWidth, height: stageDisplayHeight }}>\n              <div className=\"stage-scale-shell\" style={{ width: stageRealWidth, height: stageRealHeight, transform: `scale(${previewScale})` }}>";
source = replaceOnce(source, stageStart, stageReplacement, 'stage preview wrapper');

const modifiedStageStartIndex = source.indexOf('          <div ref={stageFrameRef} className={`stage-frame preview-scroll-enabled');
if (modifiedStageStartIndex < 0) throw new Error('Modified stage start not found');
const stageEndIndex = source.indexOf('</Stage>', modifiedStageStartIndex);
if (stageEndIndex < 0) throw new Error('Stage closing tag not found');
const closingAnchor = '\n            </div>\n          </div>';
const closingIndex = source.indexOf(closingAnchor, stageEndIndex);
if (closingIndex < 0) throw new Error('Stage wrapper closing anchor not found');
source = source.slice(0, closingIndex) + '\n              </div>\n            </div>\n          </div>' + source.slice(closingIndex + closingAnchor.length);

writeFileSync(path, source);
console.log('Preview zoom, pan, and compact viewport patch applied');
