import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Missing patch anchor: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`Patch anchor is not unique: ${label}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function replaceRange(source, startMarker, endMarker, replacement, label, fromIndex = 0) {
  const start = source.indexOf(startMarker, fromIndex);
  if (start < 0) throw new Error(`Missing range start: ${label}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`Missing range end: ${label}`);
  return source.slice(0, start) + replacement + source.slice(end);
}

const appPath = 'src/AppLive.jsx';
let app = readFileSync(appPath, 'utf8');

app = replaceOnce(
  app,
  "import { Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva';",
  "import { Ellipse, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva';",
  'Konva Ellipse import',
);

// Let PageLayer host decorations between the page background and photo frames.
{
  const start = app.indexOf('function PageLayer({');
  const end = app.indexOf('\nfunction textFontFamily', start);
  if (start < 0 || end < 0) throw new Error('Missing PageLayer block');
  let block = app.slice(start, end);
  block = replaceOnce(
    block,
    'onColumnResize, onRowResize, onActivatePage }) {',
    'onColumnResize, onRowResize, onActivatePage, underlay = null }) {',
    'PageLayer underlay prop',
  );
  let backgroundCount = 0;
  block = block.replace(/(<Rect name="background"[^\n]*\/>\n)(\s*)(\{!printMode)/g, (match, rect, indent, guides) => {
    backgroundCount += 1;
    return `${rect}${indent}{underlay}\n${indent}${guides}`;
  });
  if (backgroundCount !== 2) throw new Error(`Expected 2 PageLayer backgrounds, got ${backgroundCount}`);
  app = app.slice(0, start) + block + app.slice(end);
}

const extraLayersRenderer = String.raw`function DrawingShapeLayer({ item, selected, editable, onSelect, onChange }) {
  const groupRef = useRef(null);
  const transformerRef = useRef(null);
  const width = Math.max(20, Number(item?.width) || 320);
  const height = Math.max(20, Number(item?.height) || 320);
  const shapeKind = item?.shapeKind === 'ellipse' ? 'ellipse' : 'rectangle';
  const fillEnabled = item?.fillEnabled !== false;
  const strokeEnabled = item?.strokeEnabled === true;
  const strokeWidth = Math.max(1, Number(item?.strokeWidth) || 4);

  useEffect(() => {
    const transformer = transformerRef.current;
    const group = groupRef.current;
    if (!transformer || !group) return;
    transformer.nodes(selected && editable ? [group] : []);
    transformer.getLayer()?.batchDraw();
  }, [selected, editable, width, height, shapeKind]);

  function commitTransform() {
    const node = groupRef.current;
    if (!node || !selected || !editable) return;
    const scaleX = Math.max(0.01, Math.abs(Number(node.scaleX()) || 1));
    const scaleY = Math.max(0.01, Math.abs(Number(node.scaleY()) || 1));
    const next = {
      x: Math.round(node.x()),
      y: Math.round(node.y()),
      width: Math.max(20, Math.round(width * scaleX)),
      height: Math.max(20, Math.round(height * scaleY)),
    };
    node.scaleX(1);
    node.scaleY(1);
    onChange(item.id, next);
  }

  const shapeProps = {
    fill: fillEnabled ? (item.fillColor || '#e7d6c6') : undefined,
    stroke: strokeEnabled ? (item.strokeColor || '#6f6862') : undefined,
    strokeWidth: strokeEnabled ? strokeWidth : 0,
    strokeScaleEnabled: false,
  };

  return (
    <>
      <Group
        ref={groupRef}
        x={Number(item?.x) || 0}
        y={Number(item?.y) || 0}
        width={width}
        height={height}
        opacity={Number(item?.opacity ?? 1)}
        draggable={editable && selected}
        listening={editable}
        onMouseDown={(event) => { event.cancelBubble = true; onSelect(item.id); }}
        onTap={(event) => { event.cancelBubble = true; onSelect(item.id); }}
        onDragEnd={(event) => onChange(item.id, { x: Math.round(event.target.x()), y: Math.round(event.target.y()) })}
        onTransformEnd={commitTransform}
      >
        {shapeKind === 'ellipse' ? (
          <Ellipse x={width / 2} y={height / 2} radiusX={width / 2} radiusY={height / 2} {...shapeProps} />
        ) : (
          <Rect x={0} y={0} width={width} height={height} {...shapeProps} />
        )}
      </Group>
      {selected && editable && (
        <Transformer
          ref={transformerRef}
          rotateEnabled={false}
          keepRatio={false}
          flipEnabled={false}
          ignoreStroke
          enabledAnchors={['top-left', 'top-center', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right']}
          anchorSize={24}
          anchorCornerRadius={6}
          borderStroke="#2f7d52"
          borderStrokeWidth={2}
          anchorStroke="#2f7d52"
          anchorFill="#ffffff"
          boundBoxFunc={(oldBox, newBox) => (Math.abs(newBox.width) < 20 || Math.abs(newBox.height) < 20 ? oldBox : newBox)}
        />
      )}
    </>
  );
}

function ExtraPageLayers({
  extraLayers,
  pageIndex,
  x = 0,
  y = 0,
  mode = 'collage',
  selectedTextId = null,
  selectedDrawingId = null,
  printMode = false,
  drawingPlane = 'all',
  showTexts = true,
  onSelectText = () => {},
  onSelectDrawing = () => {},
  onTextDragEnd = () => {},
  onDrawingDragEnd = () => {},
}) {
  const texts = showTexts ? textLayersForPage(extraLayers, pageIndex) : [];
  const allDrawings = drawingLayersForPage(extraLayers, pageIndex);
  const drawings = drawingPlane === 'all'
    ? allDrawings
    : allDrawings.filter((item) => (item?.plane === 'back' ? 'back' : 'front') === drawingPlane);
  if (!texts.length && !drawings.length) return null;
  const canEditText = mode === 'text' && !printMode;
  const canEditDrawings = mode === 'drawings' && !printMode;

  return (
    <Group x={x} y={y} listening={!printMode}>
      {drawings.map((item) => {
        if (item?.type === 'image') {
          return (
            <DrawingImageLayer
              key={item.id ?? `${pageIndex}-image-${item.x}-${item.y}`}
              item={item}
              selected={item.id === selectedDrawingId}
              editable={canEditDrawings}
              onSelect={onSelectDrawing}
              onChange={onDrawingDragEnd}
            />
          );
        }
        if (item?.type === 'shape') {
          return (
            <DrawingShapeLayer
              key={item.id ?? `${pageIndex}-shape-${item.x}-${item.y}`}
              item={item}
              selected={item.id === selectedDrawingId}
              editable={canEditDrawings}
              onSelect={onSelectDrawing}
              onChange={onDrawingDragEnd}
            />
          );
        }
        if (item?.type !== 'line') return null;
        const length = Math.max(1, Number(item.length) || 300);
        const strokeWidth = Math.max(1, Number(item.strokeWidth) || 4);
        const isSelected = item.id === selectedDrawingId;
        return (
          <Group
            key={item.id ?? `${pageIndex}-line-${item.x}-${item.y}`}
            x={Number(item.x) || 0}
            y={Number(item.y) || 0}
            rotation={Number(item.angle) || 0}
            opacity={Number(item.opacity ?? 1)}
            draggable={canEditDrawings && isSelected}
            listening={canEditDrawings}
            onMouseDown={(event) => { event.cancelBubble = true; onSelectDrawing(item.id); }}
            onTap={(event) => { event.cancelBubble = true; onSelectDrawing(item.id); }}
            onDragEnd={(event) => onDrawingDragEnd(item.id, { x: Math.round(event.target.x()), y: Math.round(event.target.y()) })}
          >
            <Line
              points={[0, 0, length, 0]}
              stroke={item.color || '#6f6862'}
              strokeWidth={strokeWidth}
              lineCap="round"
              lineJoin="round"
              listening={canEditDrawings}
              hitStrokeWidth={Math.max(24, strokeWidth + 18)}
            />
            {isSelected && canEditDrawings && (
              <Line points={[0, 0, length, 0]} stroke="#2f7d52" strokeWidth={Math.max(2, strokeWidth + 8)} opacity={0.18} lineCap="round" listening={false} />
            )}
          </Group>
        );
      })}
      {texts.map((item) => {
        const fontSize = Math.max(1, Number(item.fontSize) || 56);
        const isSelected = item.id === selectedTextId;
        const width = Math.max(1, Number(item.width) || 500);
        const textValue = String(item.text ?? '');
        return (
          <Text
            key={item.id ?? `${pageIndex}-${item.x}-${item.y}`}
            x={Number(item.x) || 0}
            y={Number(item.y) || 0}
            width={width}
            text={textValue}
            fontSize={fontSize}
            fontFamily={textFontFamily(item)}
            fontStyle={textFontStyle(item)}
            lineHeight={Number(item.lineHeight) || 1.18}
            fill={item.color || '#1f2723'}
            wrap="word"
            draggable={canEditText && isSelected}
            listening={canEditText}
            onMouseDown={(event) => { event.cancelBubble = true; onSelectText(item.id); }}
            onTap={(event) => { event.cancelBubble = true; onSelectText(item.id); }}
            onDragEnd={(event) => onTextDragEnd(item.id, { x: Math.round(event.target.x()), y: Math.round(event.target.y()) })}
            shadowColor={isSelected && canEditText ? '#2f7d52' : undefined}
            shadowBlur={isSelected && canEditText ? 10 : 0}
            shadowOpacity={isSelected && canEditText ? 0.24 : 0}
          />
        );
      })}
    </Group>
  );
}
`;

app = replaceRange(app, 'function ExtraPageLayers({', '\nfunction PageNumberLayer', extraLayersRenderer, 'ExtraPageLayers renderer');

// Drawing creation helpers.
{
  const start = app.indexOf('  function createLineItem(angle = 0) {');
  const addLine = app.indexOf('  function addLine(angle = 0) {', start);
  const end = app.indexOf('\n  function ', addLine + 10);
  if (start < 0 || addLine < 0 || end < 0) throw new Error('Missing drawing creation functions');
  const block = String.raw`  function createLineItem(angle = 0) {
    return {
      id: makeId(),
      type: 'line',
      plane: 'front',
      x: Math.round(canvas.width * 0.26),
      y: Math.round(canvas.height * 0.5),
      length: Math.round((angle === 90 ? canvas.height : canvas.width) * 0.48),
      angle,
      strokeWidth: 4,
      color: '#6f6862',
      opacity: 1,
    };
  }

  function createShapeItem(shapeKind = 'rectangle') {
    const size = Math.round(Math.min(canvas.width, canvas.height) * 0.28);
    return {
      id: makeId(),
      type: 'shape',
      plane: 'front',
      shapeKind: shapeKind === 'ellipse' ? 'ellipse' : 'rectangle',
      x: Math.round((canvas.width - size) / 2),
      y: Math.round((canvas.height - size) / 2),
      width: size,
      height: size,
      fillEnabled: true,
      fillColor: '#e7d6c6',
      strokeEnabled: false,
      strokeColor: '#6f6862',
      strokeWidth: 4,
      opacity: 1,
    };
  }

  function insertDrawingItem(item) {
    setLeftPanel('drawings');
    setMode('drawings');
    setExtraLayers((current) => {
      const { next, page } = createPageLayerDraft(current, activePageNumber());
      page.drawings.push(item);
      return next;
    });
    setSelectedDrawingId(item.id);
    setSelectedTextId(null);
  }

  function addLine(angle = 0) {
    insertDrawingItem(createLineItem(angle));
  }

  function addShape(shapeKind = 'rectangle') {
    insertDrawingItem(createShapeItem(shapeKind));
  }
`;
  app = app.slice(0, start) + block + app.slice(end);
}

// Add shape buttons next to lines.
app = replaceOnce(
  app,
  `          <div className="panel-subtitle-v3">Линии</div>\n          <div className="insert-tool-grid-v3">\n            <button className="button full accent" onClick={() => addLine(0)}>+ Горизонтальная линия</button>\n            <button className="button full" onClick={() => addLine(90)}>+ Вертикальная линия</button>\n          </div>`,
  `          <div className="panel-subtitle-v3">Линии</div>\n          <div className="insert-tool-grid-v3">\n            <button className="button full accent" onClick={() => addLine(0)}>+ Горизонтальная линия</button>\n            <button className="button full" onClick={() => addLine(90)}>+ Вертикальная линия</button>\n          </div>\n          <div className="panel-subtitle-v3">Фигуры</div>\n          <div className="insert-tool-grid-v3">\n            <button className="button full accent" onClick={() => addShape('ellipse')}>+ Круг / эллипс</button>\n            <button className="button full" onClick={() => addShape('rectangle')}>+ Квадрат / прямоугольник</button>\n          </div>`,
  'shape insert buttons',
);

app = replaceOnce(
  app,
  `                  <strong>{item.type === 'image' ? (item.name || \`PNG \${index + 1}\`) : \`Линия \${index + 1}\`}</strong>\n                  <small>{item.type === 'image' ? \`\${Math.round(Number(item.width) || 0)} × \${Math.round(Number(item.height) || 0)} px\` : \`\${Math.round(Number(item.strokeWidth) || 4)} px · \${Math.round(Number(item.length) || 300)} px\`}</small>`,
  `                  <strong>{item.type === 'image' ? (item.name || \`PNG \${index + 1}\`) : item.type === 'shape' ? (item.shapeKind === 'ellipse' ? \`Круг / эллипс \${index + 1}\` : \`Прямоугольник \${index + 1}\`) : \`Линия \${index + 1}\`}</strong>\n                  <small>{item.type === 'image' ? \`\${Math.round(Number(item.width) || 0)} × \${Math.round(Number(item.height) || 0)} px\` : item.type === 'shape' ? \`\${Math.round(Number(item.width) || 0)} × \${Math.round(Number(item.height) || 0)} px · \${item.plane === 'back' ? 'под фото' : 'поверх фото'}\` : \`\${Math.round(Number(item.strokeWidth) || 4)} px · \${Math.round(Number(item.length) || 300)} px · \${item.plane === 'back' ? 'под фото' : 'поверх фото'}\`}</small>`,
  'drawing list labels',
);

// Replace the drawings inspector with image, line and shape controls plus front/back placement.
{
  const renderInspector = app.indexOf('  function renderModeInspector() {');
  const start = app.indexOf("    if (albumMode === 'drawings') {", renderInspector);
  const end = app.indexOf("    if (albumMode === 'templates') {", start);
  if (renderInspector < 0 || start < 0 || end < 0) throw new Error('Missing drawings inspector');
  const block = String.raw`    if (albumMode === 'drawings') {
      const imageDrawing = selectedDrawing?.type === 'image';
      const shapeDrawing = selectedDrawing?.type === 'shape';
      const drawingTitle = imageDrawing ? 'Настройки PNG' : shapeDrawing ? 'Настройки фигуры' : 'Настройки линии';
      const drawingDescription = imageDrawing
        ? 'Размер, поворот, слой, цвет и прозрачность.'
        : shapeDrawing
          ? 'Размер, заливка, контур, слой и прозрачность.'
          : 'Длина, угол, толщина, слой и цвет.';
      const drawingLayerControls = selectedDrawing ? (
        <div className="inspector-block">
          <h3>Положение относительно фото</h3>
          <div className="inspector-actions-grid">
            <button className={`button ${selectedDrawing.plane !== 'back' ? 'accent' : ''}`} onClick={() => updateDrawing(selectedDrawing.id, { plane: 'front' })}>Поверх фото</button>
            <button className={`button ${selectedDrawing.plane === 'back' ? 'accent' : ''}`} onClick={() => updateDrawing(selectedDrawing.id, { plane: 'back' })}>Под фото</button>
          </div>
          <p className="hint">«Под фото» оставляет рисунок на странице, но фотографии перекрывают его.</p>
        </div>
      ) : null;
      return (
        <>
          <div className="panel-title compact"><div><h2>{drawingTitle}</h2><p>{selectedDrawing ? drawingDescription : 'Выбери рисунок или добавь новый.'}</p></div><span>{selectedDrawing ? 'выбран' : 'нет'}</span></div>
          {!selectedDrawing ? <div className="empty-state small-empty"><p>PNG, линии и фигуры можно размещать поверх фотографий или уводить под них.</p></div> : imageDrawing ? (
            <>
              {drawingLayerControls}
              <div className="inspector-block"><h3>Внешний вид</h3>
                <label className="field"><span>Цвет</span><input type="color" value={selectedDrawing.color || '#000000'} onChange={(event) => updateDrawing(selectedDrawing.id, { color: event.target.value })} /></label>
                <label className="field"><span>Прозрачность, %</span><SoftNumberInput min={0} max={100} value={Math.round(Number(selectedDrawing.opacity ?? 1) * 100)} onValue={(value) => updateDrawing(selectedDrawing.id, { opacity: value / 100 })} /></label>
              </div>
              <div className="inspector-block"><h3>Размер и угол</h3><div className="geometry-grid">
                <label className="field"><span>Ширина</span><SoftNumberInput min={20} max={10000} value={Math.round(Number(selectedDrawing.width) || 300)} onValue={(value) => updateDrawing(selectedDrawing.id, { width: value })} /></label>
                <label className="field"><span>Высота</span><SoftNumberInput min={20} max={10000} value={Math.round(Number(selectedDrawing.height) || 300)} onValue={(value) => updateDrawing(selectedDrawing.id, { height: value })} /></label>
                <label className="field"><span>Поворот</span><SoftNumberInput min={-360} max={360} value={Math.round(Number(selectedDrawing.rotation) || 0)} onValue={(value) => updateDrawing(selectedDrawing.id, { rotation: value })} /></label>
              </div></div>
              <div className="inspector-block"><h3>Отражение</h3><div className="inspector-actions-grid">
                <button className={`button ${selectedDrawing.flipX ? 'accent' : ''}`} onClick={() => updateDrawing(selectedDrawing.id, { flipX: !selectedDrawing.flipX })}>↔ По горизонтали</button>
                <button className={`button ${selectedDrawing.flipY ? 'accent' : ''}`} onClick={() => updateDrawing(selectedDrawing.id, { flipY: !selectedDrawing.flipY })}>↕ По вертикали</button>
              </div></div>
              <button className="button full danger-button" onClick={() => deleteDrawing(selectedDrawing.id)}>Удалить PNG со страницы</button>
            </>
          ) : shapeDrawing ? (
            <>
              {drawingLayerControls}
              <div className="inspector-block"><h3>Фигура</h3>
                <label className="field"><span>Форма</span><select value={selectedDrawing.shapeKind === 'ellipse' ? 'ellipse' : 'rectangle'} onChange={(event) => updateDrawing(selectedDrawing.id, { shapeKind: event.target.value })}><option value="ellipse">Круг / эллипс</option><option value="rectangle">Квадрат / прямоугольник</option></select></label>
                <label className="toggle-row-v3"><input type="checkbox" checked={selectedDrawing.fillEnabled !== false} onChange={(event) => updateDrawing(selectedDrawing.id, { fillEnabled: event.target.checked })} /><span>Заливка</span></label>
                {selectedDrawing.fillEnabled !== false && <label className="field"><span>Цвет заливки</span><input type="color" value={selectedDrawing.fillColor || '#e7d6c6'} onChange={(event) => updateDrawing(selectedDrawing.id, { fillColor: event.target.value })} /></label>}
                <label className="toggle-row-v3"><input type="checkbox" checked={selectedDrawing.strokeEnabled === true} onChange={(event) => updateDrawing(selectedDrawing.id, { strokeEnabled: event.target.checked })} /><span>Контур</span></label>
                {selectedDrawing.strokeEnabled === true && <>
                  <label className="field"><span>Цвет контура</span><input type="color" value={selectedDrawing.strokeColor || '#6f6862'} onChange={(event) => updateDrawing(selectedDrawing.id, { strokeColor: event.target.value })} /></label>
                  <label className="field"><span>Толщина контура</span><SoftNumberInput min={1} max={500} value={Math.round(Number(selectedDrawing.strokeWidth) || 4)} onValue={(value) => updateDrawing(selectedDrawing.id, { strokeWidth: value })} /></label>
                </>}
                <label className="field"><span>Прозрачность, %</span><SoftNumberInput min={0} max={100} value={Math.round(Number(selectedDrawing.opacity ?? 1) * 100)} onValue={(value) => updateDrawing(selectedDrawing.id, { opacity: value / 100 })} /></label>
              </div>
              <div className="inspector-block"><h3>Положение и размер</h3><div className="geometry-grid">
                <label className="field"><span>X</span><SoftNumberInput value={Math.round(Number(selectedDrawing.x) || 0)} onValue={(value) => updateDrawing(selectedDrawing.id, { x: value })} /></label>
                <label className="field"><span>Y</span><SoftNumberInput value={Math.round(Number(selectedDrawing.y) || 0)} onValue={(value) => updateDrawing(selectedDrawing.id, { y: value })} /></label>
                <label className="field"><span>Ширина</span><SoftNumberInput min={20} max={10000} value={Math.round(Number(selectedDrawing.width) || 320)} onValue={(value) => updateDrawing(selectedDrawing.id, { width: value })} /></label>
                <label className="field"><span>Высота</span><SoftNumberInput min={20} max={10000} value={Math.round(Number(selectedDrawing.height) || 320)} onValue={(value) => updateDrawing(selectedDrawing.id, { height: value })} /></label>
              </div></div>
              <p className="hint">Фигуру можно тянуть за маркеры прямо на странице: круг станет эллипсом, квадрат — прямоугольником.</p>
              <button className="button full danger-button" onClick={() => deleteDrawing(selectedDrawing.id)}>Удалить фигуру</button>
            </>
          ) : (
            <>
              {drawingLayerControls}
              <div className="inspector-block"><h3>Линия</h3>
                <label className="field"><span>Цвет</span><input type="color" value={selectedDrawing.color || '#6f6862'} onChange={(event) => updateDrawing(selectedDrawing.id, { color: event.target.value })} /></label>
                <label className="field"><span>Толщина</span><SoftNumberInput min={1} max={120} value={Math.round(Number(selectedDrawing.strokeWidth) || 4)} onValue={(value) => updateDrawing(selectedDrawing.id, { strokeWidth: value })} /></label>
                <label className="field"><span>Прозрачность, %</span><SoftNumberInput min={0} max={100} value={Math.round(Number(selectedDrawing.opacity ?? 1) * 100)} onValue={(value) => updateDrawing(selectedDrawing.id, { opacity: value / 100 })} /></label>
              </div>
              <div className="inspector-block"><h3>Положение</h3><div className="geometry-grid">
                <label className="field"><span>X</span><SoftNumberInput value={Math.round(Number(selectedDrawing.x) || 0)} onValue={(value) => updateDrawing(selectedDrawing.id, { x: value })} /></label>
                <label className="field"><span>Y</span><SoftNumberInput value={Math.round(Number(selectedDrawing.y) || 0)} onValue={(value) => updateDrawing(selectedDrawing.id, { y: value })} /></label>
                <label className="field"><span>Длина</span><SoftNumberInput min={1} max={5000} value={Math.round(Number(selectedDrawing.length) || 300)} onValue={(value) => updateDrawing(selectedDrawing.id, { length: value })} /></label>
                <label className="field"><span>Угол</span><SoftNumberInput min={-180} max={180} value={Math.round(Number(selectedDrawing.angle) || 0)} onValue={(value) => updateDrawing(selectedDrawing.id, { angle: value })} /></label>
              </div></div>
              <button className="button full danger-button" onClick={() => deleteDrawing(selectedDrawing.id)}>Удалить линию</button>
            </>
          )}
        </>
      );
    }
`;
  app = app.slice(0, start) + block + app.slice(end);
}

// Render under-photo drawings inside PageLayer, after page background but before frames.
{
  const start = app.indexOf('  const renderEntries = entries.map((entry, entryIndex) => (');
  const end = app.indexOf('\n  const bookletLabels', start);
  if (start < 0 || end < 0) throw new Error('Missing renderEntries block');
  const block = String.raw`  const renderEntries = entries.map((entry, entryIndex) => (
    <React.Fragment key={`${entry.page?.id ?? 'blank'}-${entry.pageIndex}-${entryIndex}`}>
      <PageLayer
        page={entry.page}
        pageIndex={entry.pageIndex}
        x={entry.x}
        y={entry.y ?? 0}
        canvas={canvas}
        settings={settings}
        activePageId={isBooklet ? entry.page?.id ?? null : album.currentPageId}
        collagePreviewOnly={collagePreviewOnly || isBooklet}
        hideGuidePageLabel={isBooklet}
        selectedFrameId={selectedFrameId}
        moveFrameWithPhotoId={moveFrameWithPhotoId}
        snapGuides={frameSnapGuides?.pageId === entry.page?.id ? frameSnapGuides : null}
        smartSnap={settings.smartSnap !== false}
        onFrameSelect={selectFrame}
        onPhotoMove={updatePhoto}
        onFrameChange={changeFrame}
        onFrameDragFinish={() => setMoveFrameWithPhotoId(null)}
        onFrameContextMenu={openFrameContextMenu}
        onSnapGuidesChange={updateFrameSnapGuides}
        onColumnResize={resizeGridColumn}
        onRowResize={resizeGridRow}
        onActivatePage={(pageId) => setAlbum((current) => ({ ...current, currentPageId: pageId }))}
        underlay={(
          <ExtraPageLayers
            extraLayers={extraLayers}
            pageIndex={entry.pageIndex}
            mode={isBooklet ? 'collage' : albumMode}
            selectedDrawingId={selectedDrawingId}
            drawingPlane="back"
            showTexts={false}
            onSelectDrawing={(id) => { setSelectedDrawingId(id); setSelectedTextId(null); setSelectedFrameId(null); }}
            onDrawingDragEnd={updateDrawing}
          />
        )}
      />
      <ExtraPageLayers
        extraLayers={extraLayers}
        pageIndex={entry.pageIndex}
        x={entry.x}
        y={entry.y ?? 0}
        mode={isBooklet ? 'collage' : albumMode}
        selectedTextId={selectedTextId}
        selectedDrawingId={selectedDrawingId}
        drawingPlane="front"
        onSelectText={(id) => { setSelectedTextId(id); setSelectedDrawingId(null); setSelectedFrameId(null); }}
        onSelectDrawing={(id) => { setSelectedDrawingId(id); setSelectedTextId(null); setSelectedFrameId(null); }}
        onTextDragEnd={updateText}
        onDrawingDragEnd={updateDrawing}
      />
      {entry.page && (
        <PageNumberLayer
          pageIndex={entry.pageIndex}
          x={entry.x}
          y={entry.y ?? 0}
          canvas={canvas}
          settings={pageNumbering}
        />
      )}
    </React.Fragment>
  ));
`;
  app = app.slice(0, start) + block + app.slice(end);
}

// Export stages must preserve the same under-photo/over-photo composition.
{
  const start = app.indexOf('      {exportStagesActive && <div className="export-stage-holder" aria-hidden="true">');
  const end = app.indexOf('\n    </main>', start);
  if (start < 0 || end < 0) throw new Error('Missing export stages');
  const block = String.raw`      {exportStagesActive && <div className="export-stage-holder" aria-hidden="true">
        <Stage ref={printPageRef} width={canvas.width} height={canvas.height}>
          <Layer>
            <PageLayer
              key={`print-page-${exportPage?.id ?? exportPageIndex}`}
              page={exportPage}
              pageIndex={exportPageIndex}
              x={0}
              {...commonPageLayerProps}
              underlay={<ExtraPageLayers extraLayers={extraLayers} pageIndex={exportPageIndex} drawingPlane="back" showTexts={false} printMode />}
            />
            <ExtraPageLayers extraLayers={extraLayers} pageIndex={exportPageIndex} x={0} y={0} drawingPlane="front" printMode />
            <PageNumberLayer pageIndex={exportPageIndex} canvas={canvas} settings={pageNumbering} />
          </Layer>
        </Stage>
        <Stage ref={printSpreadRef} width={canvas.width * spreadPageCount} height={canvas.height}>
          <Layer>
            {spreadPageIndexes.map((pageIndex, position) => (
              <React.Fragment key={`print-spread-${pageIndex}`}>
                <PageLayer
                  page={pages[pageIndex]}
                  pageIndex={pageIndex}
                  x={position * canvas.width}
                  {...commonPageLayerProps}
                  underlay={<ExtraPageLayers extraLayers={extraLayers} pageIndex={pageIndex} drawingPlane="back" showTexts={false} printMode />}
                />
                <ExtraPageLayers extraLayers={extraLayers} pageIndex={pageIndex} x={position * canvas.width} y={0} drawingPlane="front" printMode />
                <PageNumberLayer pageIndex={pageIndex} x={position * canvas.width} canvas={canvas} settings={pageNumbering} />
              </React.Fragment>
            ))}
          </Layer>
        </Stage>
        <Stage ref={printBookletRef} width={bookletExportSheetSize.width} height={bookletExportSheetSize.height}>
          <Layer>
            <BookletSheetBackground canvas={canvas} printSettings={bookletExportPrintSettings} />
            {(printBookletSide?.slots ?? []).map((slot, index) => {
              const pageIndex = slot.sourcePageIndex ?? -1;
              const position = getBookletPagePosition(index, canvas, bookletExportPrintSettings);
              return (
                <React.Fragment key={`print-booklet-${printBookletSide?.id ?? 'empty'}-${index}`}>
                  <PageLayer
                    page={slot.sourcePageIndex == null ? null : pages[slot.sourcePageIndex]}
                    pageIndex={pageIndex}
                    x={position.x}
                    y={position.y}
                    {...commonPageLayerProps}
                    underlay={<ExtraPageLayers extraLayers={extraLayers} pageIndex={pageIndex} drawingPlane="back" showTexts={false} printMode />}
                  />
                  <ExtraPageLayers extraLayers={extraLayers} pageIndex={pageIndex} x={position.x} y={position.y} drawingPlane="front" printMode />
                  <PageNumberLayer pageIndex={pageIndex} x={position.x} y={position.y} canvas={canvas} settings={pageNumbering} />
                </React.Fragment>
              );
            })}
            <BookletPrintGuides canvas={canvas} printSettings={bookletExportPrintSettings} />
          </Layer>
        </Stage>
      </div>}`;
  app = app.slice(0, start) + block + app.slice(end);
}

writeFileSync(appPath, app);

const layersPath = 'src/editor/extraLayers.js';
let layers = readFileSync(layersPath, 'utf8');
const drawingSanitizer = String.raw`function sanitizeDrawingLayer(item, usedIds, idFactory) {
  const source = objectValue(item);
  if (!source) return null;
  const plane = source.plane === 'back' ? 'back' : 'front';
  if (source.type === 'image') {
    return {
      id: uniqueLayerId(source.id, usedIds, idFactory),
      type: 'image',
      plane,
      assetId: cleanString(source.assetId, '', MAX_LAYER_ID_LENGTH),
      name: cleanString(source.name, 'PNG-рисунок', 500),
      cloudKey: cleanString(source.cloudKey, '', 2_000),
      src: cleanString(source.src, '', 4_000),
      x: cleanNumber(source.x, 0, -10_000, 10_000),
      y: cleanNumber(source.y, 0, -10_000, 10_000),
      width: cleanNumber(source.width, 300, 20, 10_000),
      height: cleanNumber(source.height, 300, 20, 10_000),
      rotation: cleanNumber(source.rotation, 0, -3_600, 3_600),
      flipX: source.flipX === true,
      flipY: source.flipY === true,
      color: cleanString(source.color, '#000000', MAX_COLOR_LENGTH),
      opacity: cleanNumber(source.opacity, 1, 0, 1),
    };
  }
  if (source.type === 'shape') {
    return {
      id: uniqueLayerId(source.id, usedIds, idFactory),
      type: 'shape',
      plane,
      shapeKind: source.shapeKind === 'ellipse' ? 'ellipse' : 'rectangle',
      x: cleanNumber(source.x, 0, -10_000, 10_000),
      y: cleanNumber(source.y, 0, -10_000, 10_000),
      width: cleanNumber(source.width, 320, 20, 10_000),
      height: cleanNumber(source.height, 320, 20, 10_000),
      fillEnabled: source.fillEnabled !== false,
      fillColor: cleanString(source.fillColor, '#e7d6c6', MAX_COLOR_LENGTH),
      strokeEnabled: source.strokeEnabled === true,
      strokeColor: cleanString(source.strokeColor, '#6f6862', MAX_COLOR_LENGTH),
      strokeWidth: cleanNumber(source.strokeWidth, 4, 1, 500),
      opacity: cleanNumber(source.opacity, 1, 0, 1),
    };
  }
  if (source.type !== 'line') return null;
  return {
    id: uniqueLayerId(source.id, usedIds, idFactory),
    type: 'line',
    plane,
    x: cleanNumber(source.x, 0, -10_000, 10_000),
    y: cleanNumber(source.y, 0, -10_000, 10_000),
    length: cleanNumber(source.length, 300, 1, 10_000),
    angle: cleanNumber(source.angle, 0, -3_600, 3_600),
    strokeWidth: cleanNumber(source.strokeWidth, 4, 1, 500),
    color: cleanString(source.color, '#6f6862', MAX_COLOR_LENGTH),
    opacity: cleanNumber(source.opacity, 1, 0, 1),
  };
}
`;
layers = replaceRange(layers, 'function sanitizeDrawingLayer(item, usedIds, idFactory) {', '\nfunction sanitizeTemplateLayer', drawingSanitizer, 'drawing sanitizer');
writeFileSync(layersPath, layers);

console.log('Drawing planes and editable shapes added');
