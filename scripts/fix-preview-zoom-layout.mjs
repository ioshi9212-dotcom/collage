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
  `  const fitPreviewScale = getPreviewScale({
    stageWidth: stageRealWidth,
    stageHeight: stageRealHeight,
    viewportWidth: previewViewport.width,
    viewportHeight: previewViewport.height,
  });
  const previewScale = fitPreviewScale * previewZoom;
  const fitStageDisplayWidth = stageRealWidth * fitPreviewScale;
  const fitStageDisplayHeight = stageRealHeight * fitPreviewScale;
  const stageDisplayWidth = stageRealWidth * previewScale;
  const stageDisplayHeight = stageRealHeight * previewScale;`,
  `  const fitPreviewScale = getPreviewScale({
    stageWidth: stageRealWidth,
    stageHeight: stageRealHeight,
    viewportWidth: previewViewport.width,
    viewportHeight: previewViewport.height,
  });
  const effectivePreviewZoom = isBooklet ? 1 : previewZoom;
  const previewScale = fitPreviewScale * effectivePreviewZoom;
  const stageDisplayWidth = stageRealWidth * fitPreviewScale;
  const stageDisplayHeight = stageRealHeight * fitPreviewScale;
  const zoomedStageDisplayWidth = stageDisplayWidth * effectivePreviewZoom;
  const zoomedStageDisplayHeight = stageDisplayHeight * effectivePreviewZoom;`,
  'stable preview scale',
);

source = replaceOnce(
  source,
  `  function startPreviewPan(event) {
    if (!previewPanMode || previewZoom <= 1 || event.button !== 0) return;`,
  `  function startPreviewPan(event) {
    if (isBooklet || !previewPanMode || previewZoom <= 1 || event.button !== 0) return;`,
  'booklet pan guard',
);

source = replaceOnce(
  source,
  `<section ref={canvasAreaRef} className={\`canvas-area \${isSpread || isBooklet ? 'album-mode' : ''} \${isBooklet ? 'booklet-canvas-area' : ''}\`} style={{ '--stage-display-width': \`\${stageDisplayWidth}px\`, '--stage-display-height': \`\${stageDisplayHeight}px\`, '--stage-viewport-width': \`\${fitStageDisplayWidth}px\`, '--stage-viewport-height': \`\${fitStageDisplayHeight}px\` }}>`,
  `<section ref={canvasAreaRef} className={\`canvas-area \${isSpread || isBooklet ? 'album-mode' : ''} \${isBooklet ? 'booklet-canvas-area' : ''}\`} style={{ '--stage-display-width': \`\${stageDisplayWidth}px\`, '--stage-display-height': \`\${stageDisplayHeight}px\` }}>`,
  'stable canvas variables',
);

const controls = `            <div className="preview-zoom-controls" aria-label="Масштаб просмотра альбома">
              <button type="button" className="small-button" aria-label="Уменьшить альбом" onClick={() => applyPreviewZoom(previewZoom - 0.25)} disabled={previewZoom <= 1}>−</button>
              <button type="button" className="small-button" aria-label="По размеру" onClick={() => applyPreviewZoom(1)}>По размеру</button>
              <span className="preview-zoom-value" aria-live="polite">{Math.round(previewZoom * 100)}%</span>
              <button type="button" className="small-button" aria-label="Увеличить альбом" onClick={() => applyPreviewZoom(previewZoom + 0.25)} disabled={previewZoom >= 3}>+</button>
              <button type="button" className={\`small-button preview-pan-button \${previewPanMode ? 'active-mode' : ''}\`} aria-label="Двигать просмотр" aria-pressed={previewPanMode} onClick={() => setPreviewPanMode((value) => !value)} disabled={previewZoom <= 1}>Двигать</button>
            </div>`;
source = replaceOnce(
  source,
  controls,
  `            {!isBooklet && (
              <div className="preview-zoom-controls" aria-label="Масштаб просмотра альбома">
                <button type="button" className="small-button" aria-label="Уменьшить альбом" onClick={() => applyPreviewZoom(previewZoom - 0.25)} disabled={previewZoom <= 1}>−</button>
                <button type="button" className="small-button" aria-label="По размеру" onClick={() => applyPreviewZoom(1)}>По размеру</button>
                <span className="preview-zoom-value" aria-live="polite">{Math.round(previewZoom * 100)}%</span>
                <button type="button" className="small-button" aria-label="Увеличить альбом" onClick={() => applyPreviewZoom(previewZoom + 0.25)} disabled={previewZoom >= 3}>+</button>
                <button type="button" className={\`small-button preview-pan-button \${previewPanMode ? 'active-mode' : ''}\`} aria-label="Двигать просмотр" aria-pressed={previewPanMode} onClick={() => setPreviewPanMode((value) => !value)} disabled={previewZoom <= 1}>Двигать</button>
              </div>
            )}`,
  'hide zoom in booklet',
);

source = replaceOnce(
  source,
  `<div ref={stageFrameRef} className={\`stage-frame preview-scroll-enabled \${isSpread || isBooklet ? 'album-preview' : ''} \${isBooklet ? 'booklet-stage' : ''} \${previewPanMode ? 'preview-pan-mode' : ''}\`} onPointerDown={startPreviewPan} onPointerMove={movePreviewPan} onPointerUp={finishPreviewPan} onPointerCancel={finishPreviewPan} onDragOver={(event) => { if (!isBooklet && !previewPanMode) event.preventDefault(); }} onDrop={isBooklet || previewPanMode ? undefined : dropPhoto}>
            <div className="stage-pan-surface" style={{ width: stageDisplayWidth, height: stageDisplayHeight }}>`,
  `<div ref={stageFrameRef} className={\`stage-frame \${!isBooklet ? 'preview-scroll-enabled' : ''} \${isSpread || isBooklet ? 'album-preview' : ''} \${isBooklet ? 'booklet-stage' : ''} \${!isBooklet && previewPanMode ? 'preview-pan-mode' : ''}\`} onPointerDown={startPreviewPan} onPointerMove={movePreviewPan} onPointerUp={finishPreviewPan} onPointerCancel={finishPreviewPan} onDragOver={(event) => { if (!isBooklet && !previewPanMode) event.preventDefault(); }} onDrop={isBooklet || previewPanMode ? undefined : dropPhoto}>
            <div className="stage-pan-surface" style={{ width: zoomedStageDisplayWidth, height: zoomedStageDisplayHeight }}>`,
  'stable stage viewport',
);

writeFileSync(path, source);
console.log('Preview zoom layout stabilized');
