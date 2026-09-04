from pathlib import Path


def replace_once(source: str, before: str, after: str, label: str) -> str:
    first = source.find(before)
    if first < 0:
        raise RuntimeError(f"Missing patch anchor: {label}")
    if source.find(before, first + len(before)) >= 0:
        raise RuntimeError(f"Patch anchor is not unique: {label}")
    return source[:first] + after + source[first + len(before):]


def replace_range(source: str, start_marker: str, end_marker: str, replacement: str, label: str, from_index: int = 0) -> str:
    start = source.find(start_marker, from_index)
    if start < 0:
        raise RuntimeError(f"Missing range start: {label}")
    end = source.find(end_marker, start + len(start_marker))
    if end < 0:
        raise RuntimeError(f"Missing range end: {label}")
    return source[:start] + replacement + source[end:]


app_path = Path('src/AppLive.jsx')
app = app_path.read_text(encoding='utf-8')

app = replace_once(
    app,
    "import { Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva';",
    "import { Ellipse, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva';",
    'Konva Ellipse import',
)

# PageLayer owns the background and photo frames, so a drawing underlay placed here
# is genuinely below photos but still above the page background.
page_start = app.find('function PageLayer({')
page_end = app.find('\nfunction textFontFamily', page_start)
if page_start < 0 or page_end < 0:
    raise RuntimeError('Missing PageLayer block')
page_block = app[page_start:page_end]
page_block = replace_once(
    page_block,
    'onColumnResize, onRowResize, onActivatePage }) {',
    'onColumnResize, onRowResize, onActivatePage, underlay = null }) {',
    'PageLayer underlay prop',
)
background = '<Rect name="background" x={0} y={0} width={canvas.width} height={canvas.height} fill={settings.borderColor} />'
if page_block.count(background) != 2:
    raise RuntimeError(f'Expected 2 PageLayer backgrounds, got {page_block.count(background)}')
page_block = page_block.replace(background, background + '\n        {underlay}')
app = app[:page_start] + page_block + app[page_end:]

extra_layers_renderer = r'''function DrawingShapeLayer({ item, selected, editable, onSelect, onChange }) {
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
'''
app = replace_range(app, 'function ExtraPageLayers({', '\nfunction PageNumberLayer', extra_layers_renderer, 'ExtraPageLayers renderer')

creation_start = app.find('  function createLineItem(angle = 0) {')
creation_end = app.find('  function addDrawingAsset(asset) {', creation_start)
if creation_start < 0 or creation_end < 0:
    raise RuntimeError('Missing drawing creation block')
creation_block = r'''  function createLineItem(angle = 0) {
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

'''
app = app[:creation_start] + creation_block + app[creation_end:]

app = replace_once(
    app,
    '''          <div className="panel-subtitle-v3">Линии</div>
          <div className="insert-tool-grid-v3">
            <button className="button full accent" onClick={() => addLine(0)}>+ Горизонтальная линия</button>
            <button className="button full" onClick={() => addLine(90)}>+ Вертикальная линия</button>
          </div>''',
    '''          <div className="panel-subtitle-v3">Линии</div>
          <div className="insert-tool-grid-v3">
            <button className="button full accent" onClick={() => addLine(0)}>+ Горизонтальная линия</button>
            <button className="button full" onClick={() => addLine(90)}>+ Вертикальная линия</button>
          </div>
          <div className="panel-subtitle-v3">Фигуры</div>
          <div className="insert-tool-grid-v3">
            <button className="button full accent" onClick={() => addShape('ellipse')}>+ Круг / эллипс</button>
            <button className="button full" onClick={() => addShape('rectangle')}>+ Квадрат / прямоугольник</button>
          </div>''',
    'shape insert buttons',
)

app = replace_once(
    app,
    '''                  <strong>{item.type === 'image' ? (item.name || `PNG ${index + 1}`) : `Линия ${index + 1}`}</strong>
                  <small>{item.type === 'image' ? `${Math.round(Number(item.width) || 0)} × ${Math.round(Number(item.height) || 0)} px` : `${Math.round(Number(item.strokeWidth) || 4)} px · ${Math.round(Number(item.length) || 300)} px`}</small>''',
    '''                  <strong>{item.type === 'image' ? (item.name || `PNG ${index + 1}`) : item.type === 'shape' ? (item.shapeKind === 'ellipse' ? `Круг / эллипс ${index + 1}` : `Прямоугольник ${index + 1}`) : `Линия ${index + 1}`}</strong>
                  <small>{item.type === 'image' ? `${Math.round(Number(item.width) || 0)} × ${Math.round(Number(item.height) || 0)} px · ${item.plane === 'back' ? 'под фото' : 'поверх фото'}` : item.type === 'shape' ? `${Math.round(Number(item.width) || 0)} × ${Math.round(Number(item.height) || 0)} px · ${item.plane === 'back' ? 'под фото' : 'поверх фото'}` : `${Math.round(Number(item.strokeWidth) || 4)} px · ${Math.round(Number(item.length) || 300)} px · ${item.plane === 'back' ? 'под фото' : 'поверх фото'}`}</small>''',
    'drawing list labels',
)

render_inspector = app.find('  function renderModeInspector() {')
draw_start = app.find("    if (albumMode === 'drawings') {", render_inspector)
draw_end = app.find("    if (albumMode === 'templates') {", draw_start)
if render_inspector < 0 or draw_start < 0 or draw_end < 0:
    raise RuntimeError('Missing drawings inspector')
drawing_inspector = r'''    if (albumMode === 'drawings') {
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
                <label className="toggle-row-v3"><input aria-label="Заливка" type="checkbox" checked={selectedDrawing.fillEnabled !== false} onChange={(event) => updateDrawing(selectedDrawing.id, { fillEnabled: event.target.checked })} /><span>Заливка</span></label>
                {selectedDrawing.fillEnabled !== false && <label className="field"><span>Цвет заливки</span><input type="color" value={selectedDrawing.fillColor || '#e7d6c6'} onChange={(event) => updateDrawing(selectedDrawing.id, { fillColor: event.target.value })} /></label>}
                <label className="toggle-row-v3"><input aria-label="Контур" type="checkbox" checked={selectedDrawing.strokeEnabled === true} onChange={(event) => updateDrawing(selectedDrawing.id, { strokeEnabled: event.target.checked })} /><span>Контур</span></label>
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
'''
app = app[:draw_start] + drawing_inspector + app[draw_end:]

render_start = app.find('  const renderEntries = entries.map((entry, entryIndex) => (')
render_end = app.find('\n  const bookletLabels', render_start)
if render_start < 0 or render_end < 0:
    raise RuntimeError('Missing renderEntries block')
render_entries = r'''  const renderEntries = entries.map((entry, entryIndex) => (
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
'''
app = app[:render_start] + render_entries + app[render_end:]

export_start = app.find('      {exportStagesActive && <div className="export-stage-holder" aria-hidden="true">')
export_end = app.find('\n    </main>', export_start)
if export_start < 0 or export_end < 0:
    raise RuntimeError('Missing export stages')
export_stages = r'''      {exportStagesActive && <div className="export-stage-holder" aria-hidden="true">
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
      </div>}'''
app = app[:export_start] + export_stages + app[export_end:]

app_path.write_text(app, encoding='utf-8')

layers_path = Path('src/editor/extraLayers.js')
layers = layers_path.read_text(encoding='utf-8')
drawing_sanitizer = r'''function sanitizeDrawingLayer(item, usedIds, idFactory) {
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
'''
layers = replace_range(layers, 'function sanitizeDrawingLayer(item, usedIds, idFactory) {', '\nfunction sanitizeTemplateLayer', drawing_sanitizer, 'drawing sanitizer')
layers_path.write_text(layers, encoding='utf-8')

print('Drawing planes and editable shapes added')
