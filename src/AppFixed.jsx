import { useEffect, useMemo, useRef, useState } from 'react';
import { Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva';

const STORAGE_KEY = 'collage-creator-album-v11';
const LEGACY_STORAGE_KEYS = [
  'collage-creator-album-v10',
  'collage-creator-album-v9',
  'collage-creator-album-v8',
  'collage-creator-album-v7',
  'collage-creator-album-v6',
  'collage-creator-album-v5',
  'collage-creator-album-v4',
];
const MIN_FRAME_SIZE = 80;
const SPREAD_GAP = 90;
const EXPORT_PIXEL_RATIO = 2;

const CANVAS_PRESETS = [
  { id: 'a5-portrait', label: 'A5 вертикальный', width: 1480, height: 2100 },
  { id: 'a5-landscape', label: 'A5 горизонтальный', width: 2100, height: 1480 },
  { id: 'a4-portrait', label: 'A4 вертикальный', width: 2100, height: 2970 },
  { id: 'square', label: 'Квадрат', width: 2000, height: 2000 },
  { id: 'draft', label: 'Черновик', width: 1000, height: 700 },
  { id: 'custom', label: 'Свой размер', width: 1480, height: 2100 },
];

const DEFAULT_CANVAS = { width: 1480, height: 2100 };
const DEFAULT_SETTINGS = {
  presetId: 'a5-portrait',
  frameCount: 5,
  padding: 70,
  gap: 28,
  borderWidth: 0,
  borderColor: '#ffffff',
  showGuides: true,
  frameMode: 'free',
};

const imageCache = new Map();

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function padNumber(value) {
  return String(value).padStart(2, '0');
}

function loadImage(src) {
  if (imageCache.has(src)) return Promise.resolve(imageCache.get(src));
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => {
      imageCache.set(src, image);
      resolve(image);
    };
    image.onerror = reject;
    image.src = src;
  });
}

function downloadText(filename, content) {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadDataUrl(filename, dataUrl) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function getLayoutRows(frameCount) {
  const layouts = {
    1: [1],
    2: [2],
    3: [2, 1],
    4: [2, 2],
    5: [2, 2, 1],
    6: [3, 3],
    7: [3, 3, 1],
    8: [4, 4],
    9: [3, 3, 3],
  };
  return layouts[frameCount] ?? layouts[5];
}

function createFrames(canvas, settings, previousFrames = []) {
  const rows = getLayoutRows(settings.frameCount);
  const padding = Math.min(settings.padding, Math.floor(canvas.width / 3), Math.floor(canvas.height / 3));
  const gap = Math.max(0, settings.gap);
  const innerWidth = Math.max(40, canvas.width - padding * 2);
  const innerHeight = Math.max(40, canvas.height - padding * 2);
  const rowHeight = (innerHeight - gap * (rows.length - 1)) / rows.length;
  const frames = [];

  rows.forEach((columns, rowIndex) => {
    const columnWidth = (innerWidth - gap * (columns - 1)) / columns;
    for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
      const previous = previousFrames[frames.length];
      frames.push({
        id: previous?.id ?? `frame_${frames.length + 1}`,
        x: Math.round(padding + columnIndex * (columnWidth + gap)),
        y: Math.round(padding + rowIndex * (rowHeight + gap)),
        width: Math.round(columnWidth),
        height: Math.round(rowHeight),
        photo: previous?.photo ?? null,
      });
    }
  });

  return frames.slice(0, settings.frameCount);
}

function createPage(canvas, settings, index, frames) {
  return {
    id: createId(),
    title: `Страница ${index}`,
    frames: frames ?? createFrames(canvas, settings),
  };
}

function cloneFrames(frames) {
  return frames.map((frame, index) => ({
    ...frame,
    id: `frame_${index + 1}`,
    photo: frame.photo ? { ...frame.photo } : null,
  }));
}

function clampFrame(frame, canvas) {
  const width = clampNumber(Math.round(Number(frame.width)), MIN_FRAME_SIZE, canvas.width);
  const height = clampNumber(Math.round(Number(frame.height)), MIN_FRAME_SIZE, canvas.height);
  return {
    ...frame,
    width,
    height,
    x: clampNumber(Math.round(Number(frame.x)), 0, Math.max(0, canvas.width - width)),
    y: clampNumber(Math.round(Number(frame.y)), 0, Math.max(0, canvas.height - height)),
  };
}

function getCoverRect(image, frame, photo) {
  if (!image) return null;
  const zoom = photo?.zoom ?? 1;
  const coverScale = Math.max(frame.width / image.width, frame.height / image.height) * zoom;
  const width = image.width * coverScale;
  const height = image.height * coverScale;
  const baseX = (frame.width - width) / 2;
  const baseY = (frame.height - height) / 2;
  return {
    x: baseX + (photo?.offsetX ?? 0),
    y: baseY + (photo?.offsetY ?? 0),
    baseX,
    baseY,
    width,
    height,
  };
}

function clampPhotoPosition(cover, frame, x, y) {
  if (!cover) return { x, y };
  const minX = Math.min(0, frame.width - cover.width);
  const minY = Math.min(0, frame.height - cover.height);
  return {
    x: clampNumber(x, minX, 0),
    y: clampNumber(y, minY, 0),
  };
}

function overlap1d(startA, endA, startB, endB) {
  return Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
}

function linkedGridChange(frames, changedId, patch, canvas, gap) {
  const tolerance = Math.max(8, gap / 2 + 6);
  const source = frames.map((frame) => clampFrame(frame, canvas));
  const oldFrame = source.find((frame) => frame.id === changedId);
  if (!oldFrame) return source;

  let next = clampFrame({ ...oldFrame, ...patch }, canvas);
  let nextLeft = next.x;
  let nextRight = next.x + next.width;
  let nextTop = next.y;
  let nextBottom = next.y + next.height;

  const oldLeft = oldFrame.x;
  const oldRight = oldFrame.x + oldFrame.width;
  const oldTop = oldFrame.y;
  const oldBottom = oldFrame.y + oldFrame.height;

  const movedLeft = Math.abs(nextLeft - oldLeft) > 0.5;
  const movedRight = Math.abs(nextRight - oldRight) > 0.5;
  const movedTop = Math.abs(nextTop - oldTop) > 0.5;
  const movedBottom = Math.abs(nextBottom - oldBottom) > 0.5;

  const neighbors = source.filter((frame) => frame.id !== changedId);
  const verticalTouch = (frame) => overlap1d(frame.y, frame.y + frame.height, oldTop, oldBottom) > 4;
  const horizontalTouch = (frame) => overlap1d(frame.x, frame.x + frame.width, oldLeft, oldRight) > 4;

  const leftNeighbors = neighbors.filter((frame) => verticalTouch(frame) && Math.abs(frame.x + frame.width + gap - oldLeft) <= tolerance);
  const rightNeighbors = neighbors.filter((frame) => verticalTouch(frame) && Math.abs(frame.x - (oldRight + gap)) <= tolerance);
  const topNeighbors = neighbors.filter((frame) => horizontalTouch(frame) && Math.abs(frame.y + frame.height + gap - oldTop) <= tolerance);
  const bottomNeighbors = neighbors.filter((frame) => horizontalTouch(frame) && Math.abs(frame.y - (oldBottom + gap)) <= tolerance);

  if (movedLeft && leftNeighbors.length) {
    const minLeft = Math.max(...leftNeighbors.map((frame) => frame.x + MIN_FRAME_SIZE + gap));
    nextLeft = Math.max(nextLeft, minLeft);
  }
  if (movedRight && rightNeighbors.length) {
    const maxRight = Math.min(...rightNeighbors.map((frame) => frame.x + frame.width - MIN_FRAME_SIZE - gap));
    nextRight = Math.min(nextRight, maxRight);
  }
  if (movedTop && topNeighbors.length) {
    const minTop = Math.max(...topNeighbors.map((frame) => frame.y + MIN_FRAME_SIZE + gap));
    nextTop = Math.max(nextTop, minTop);
  }
  if (movedBottom && bottomNeighbors.length) {
    const maxBottom = Math.min(...bottomNeighbors.map((frame) => frame.y + frame.height - MIN_FRAME_SIZE - gap));
    nextBottom = Math.min(nextBottom, maxBottom);
  }

  if (nextRight - nextLeft < MIN_FRAME_SIZE) {
    if (movedLeft && !movedRight) nextLeft = nextRight - MIN_FRAME_SIZE;
    else nextRight = nextLeft + MIN_FRAME_SIZE;
  }
  if (nextBottom - nextTop < MIN_FRAME_SIZE) {
    if (movedTop && !movedBottom) nextTop = nextBottom - MIN_FRAME_SIZE;
    else nextBottom = nextTop + MIN_FRAME_SIZE;
  }

  next = clampFrame({ ...next, x: nextLeft, y: nextTop, width: nextRight - nextLeft, height: nextBottom - nextTop }, canvas);
  nextLeft = next.x;
  nextRight = next.x + next.width;
  nextTop = next.y;
  nextBottom = next.y + next.height;

  const updated = new Map([[changedId, next]]);

  neighbors.forEach((frame) => {
    let item = { ...frame };
    if (movedLeft && leftNeighbors.some((neighbor) => neighbor.id === frame.id)) {
      const right = nextLeft - gap;
      item.width = Math.max(MIN_FRAME_SIZE, right - item.x);
    }
    if (movedRight && rightNeighbors.some((neighbor) => neighbor.id === frame.id)) {
      const right = item.x + item.width;
      item.x = nextRight + gap;
      item.width = Math.max(MIN_FRAME_SIZE, right - item.x);
    }
    if (movedTop && topNeighbors.some((neighbor) => neighbor.id === frame.id)) {
      const bottom = nextTop - gap;
      item.height = Math.max(MIN_FRAME_SIZE, bottom - item.y);
    }
    if (movedBottom && bottomNeighbors.some((neighbor) => neighbor.id === frame.id)) {
      const bottom = item.y + item.height;
      item.y = nextBottom + gap;
      item.height = Math.max(MIN_FRAME_SIZE, bottom - item.y);
    }
    updated.set(frame.id, clampFrame(item, canvas));
  });

  return source.map((frame) => updated.get(frame.id) ?? frame);
}

function normalizeLinkedGrid(frames, canvas, gap) {
  let normalized = frames.map((frame) => clampFrame(frame, canvas));
  normalized.forEach((frame) => {
    normalized = linkedGridChange(normalized, frame.id, {}, canvas, gap);
  });
  return normalized;
}

function CollageFrame({ frame, selected, locked, borderWidth, borderColor, showEmptyHint, printMode, canvas, onSelect, onPhotoMove, onFrameChange }) {
  const [image, setImage] = useState(null);
  const groupRef = useRef(null);
  const transformerRef = useRef(null);
  const photo = frame.photo;
  const cover = photo ? getCoverRect(image, frame, photo) : null;
  const canDragFrame = !printMode && selected && !photo;
  const canDragPhoto = !printMode && selected && Boolean(photo);

  useEffect(() => {
    let active = true;
    if (!photo?.src) {
      setImage(null);
      return () => {
        active = false;
      };
    }
    loadImage(photo.src)
      .then((loadedImage) => {
        if (active) setImage(loadedImage);
      })
      .catch(() => {
        if (active) setImage(null);
      });
    return () => {
      active = false;
    };
  }, [photo?.src]);

  useEffect(() => {
    if (!transformerRef.current || !groupRef.current) return;
    if (selected && !printMode) transformerRef.current.nodes([groupRef.current]);
    else transformerRef.current.nodes([]);
    transformerRef.current.getLayer()?.batchDraw();
  }, [selected, printMode, frame.x, frame.y, frame.width, frame.height]);

  function readNodeTransform() {
    const node = groupRef.current;
    if (!node) return null;
    const next = {
      x: node.x(),
      y: node.y(),
      width: frame.width * node.scaleX(),
      height: frame.height * node.scaleY(),
    };
    node.scaleX(1);
    node.scaleY(1);
    return next;
  }

  function commitTransform() {
    if (printMode || !selected) return;
    const next = readNodeTransform();
    if (next) onFrameChange(frame.id, next);
  }

  function commitLiveTransform() {
    if (!locked || printMode || !selected) return;
    const next = readNodeTransform();
    if (next) onFrameChange(frame.id, next);
  }

  function commitFrameDrag(event) {
    if (printMode || !selected || photo) return;
    onFrameChange(frame.id, { x: event.target.x(), y: event.target.y() });
  }

  function commitLiveFrameDrag(event) {
    if (!locked || printMode || !selected || photo) return;
    onFrameChange(frame.id, { x: event.target.x(), y: event.target.y() });
  }

  function selectFromPhoto(event) {
    event.cancelBubble = true;
    onSelect();
  }

  function clampDraggedPhoto(event) {
    if (!cover) return;
    event.cancelBubble = true;
    const next = clampPhotoPosition(cover, frame, event.target.x(), event.target.y());
    event.target.x(next.x);
    event.target.y(next.y);
  }

  function commitPhotoDrag(event) {
    if (printMode || !cover) return;
    event.cancelBubble = true;
    const next = clampPhotoPosition(cover, frame, event.target.x(), event.target.y());
    event.target.x(next.x);
    event.target.y(next.y);
    onPhotoMove(frame.id, {
      offsetX: Math.round(next.x - cover.baseX),
      offsetY: Math.round(next.y - cover.baseY),
    });
  }

  return (
    <>
      <Group
        ref={groupRef}
        x={frame.x}
        y={frame.y}
        draggable={canDragFrame}
        onMouseDown={onSelect}
        onTap={onSelect}
        onDragMove={commitLiveFrameDrag}
        onDragEnd={commitFrameDrag}
        onTransform={commitLiveTransform}
        onTransformEnd={commitTransform}
      >
        <Group clipX={0} clipY={0} clipWidth={frame.width} clipHeight={frame.height}>
          <Rect
            x={0}
            y={0}
            width={frame.width}
            height={frame.height}
            fill="#fbf7f2"
            stroke={selected && !printMode ? (locked ? '#2f7d52' : '#c27b4f') : borderColor}
            strokeWidth={selected && !printMode ? Math.max(5, borderWidth) : borderWidth}
            strokeScaleEnabled={false}
          />
          {photo && cover && (
            <KonvaImage
              image={image}
              x={cover.x}
              y={cover.y}
              width={cover.width}
              height={cover.height}
              draggable={canDragPhoto}
              onMouseDown={selectFromPhoto}
              onTap={selectFromPhoto}
              onDragStart={(event) => {
                event.cancelBubble = true;
              }}
              onDragMove={clampDraggedPhoto}
              onDragEnd={commitPhotoDrag}
            />
          )}
          {!photo && showEmptyHint && (
            <Rect
              x={14}
              y={14}
              width={Math.max(0, frame.width - 28)}
              height={Math.max(0, frame.height - 28)}
              stroke="#d8c7b9"
              strokeWidth={2}
              strokeScaleEnabled={false}
              dash={[14, 10]}
              cornerRadius={12}
            />
          )}
        </Group>
      </Group>
      {selected && !printMode && (
        <Transformer
          ref={transformerRef}
          rotateEnabled={false}
          keepRatio={false}
          flipEnabled={false}
          ignoreStroke
          enabledAnchors={[
            'top-left',
            'top-center',
            'top-right',
            'middle-left',
            'middle-right',
            'bottom-left',
            'bottom-center',
            'bottom-right',
          ]}
          anchorSize={locked ? 30 : 24}
          anchorCornerRadius={6}
          borderStroke={locked ? '#2f7d52' : '#c27b4f'}
          borderStrokeWidth={3}
          anchorStroke={locked ? '#2f7d52' : '#c27b4f'}
          anchorFill="#fff7ef"
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < MIN_FRAME_SIZE || newBox.height < MIN_FRAME_SIZE) return oldBox;
            return newBox;
          }}
        />
      )}
    </>
  );
}

function PageLayer({ page, pageIndex, x, canvas, settings, isActive, selectedFrameId, printMode = false, onFrameSelect, onPhotoMove, onFrameChange }) {
  if (!page) {
    return (
      <Group x={x} y={0}>
        <Rect width={canvas.width} height={canvas.height} fill={settings.borderColor} />
      </Group>
    );
  }

  const locked = settings.frameMode === 'locked';
  const showGuides = !printMode && settings.showGuides;
  const safePadding = Math.min(settings.padding, Math.floor(canvas.width / 3), Math.floor(canvas.height / 3));

  return (
    <Group x={x} y={0}>
      <Rect name="background" x={0} y={0} width={canvas.width} height={canvas.height} fill={settings.borderColor} />
      {showGuides && (
        <>
          <Rect
            x={safePadding}
            y={safePadding}
            width={Math.max(0, canvas.width - safePadding * 2)}
            height={Math.max(0, canvas.height - safePadding * 2)}
            stroke={locked ? '#2f7d52' : '#c27b4f'}
            strokeWidth={2}
            strokeScaleEnabled={false}
            dash={[18, 14]}
            listening={false}
          />
          <Text
            x={safePadding + 16}
            y={safePadding + 16}
            text={locked ? 'связанные окна / постоянный зазор' : 'поля / безопасная зона'}
            fontSize={28}
            fill={locked ? '#2f7d52' : '#c27b4f'}
            opacity={0.62}
            listening={false}
          />
        </>
      )}
      {!printMode && (
        <Text
          x={28}
          y={24}
          text={`Стр. ${pageIndex + 1}`}
          fontSize={34}
          fill={isActive ? (locked ? '#2f7d52' : '#c27b4f') : '#b49a87'}
          fontStyle="bold"
          listening={false}
        />
      )}
      {page.frames.map((frame) => (
        <CollageFrame
          key={frame.id}
          frame={frame}
          selected={!printMode && isActive && frame.id === selectedFrameId}
          locked={locked}
          borderWidth={settings.borderWidth}
          borderColor={settings.borderColor}
          showEmptyHint={!printMode && !frame.photo}
          printMode={printMode}
          canvas={canvas}
          onSelect={() => {
            if (!printMode) onFrameSelect(page.id, frame.id);
          }}
          onPhotoMove={(frameId, patch) => {
            if (!printMode) onPhotoMove(page.id, frameId, patch);
          }}
          onFrameChange={(frameId, patch) => {
            if (!printMode) onFrameChange(page.id, frameId, patch);
          }}
        />
      ))}
    </Group>
  );
}

function createInitialAlbum() {
  const firstPage = createPage(DEFAULT_CANVAS, DEFAULT_SETTINGS, 1);
  const secondPage = createPage(DEFAULT_CANVAS, DEFAULT_SETTINGS, 2);
  return { pages: [firstPage, secondPage], currentPageId: firstPage.id };
}

export default function App() {
  const stageRef = useRef(null);
  const printPageStageRef = useRef(null);
  const printSpreadStageRef = useRef(null);
  const jsonInputRef = useRef(null);
  const [album, setAlbum] = useState(createInitialAlbum);
  const [library, setLibrary] = useState([]);
  const [canvas, setCanvas] = useState(DEFAULT_CANVAS);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [selectedFrameId, setSelectedFrameId] = useState(null);
  const [selectedPhotoId, setSelectedPhotoId] = useState(null);
  const [viewMode, setViewMode] = useState('spread');
  const [notice, setNotice] = useState('');

  const pages = album.pages;
  const currentPageIndex = Math.max(0, pages.findIndex((page) => page.id === album.currentPageId));
  const currentPage = pages[currentPageIndex] ?? pages[0];
  const frames = currentPage?.frames ?? [];
  const spreadStartIndex = currentPageIndex % 2 === 0 ? currentPageIndex : currentPageIndex - 1;
  const spreadEndIndex = Math.min(spreadStartIndex + 1, pages.length - 1);
  const isSpreadMode = viewMode === 'spread';
  const locked = settings.frameMode === 'locked';
  const visibleEntries = isSpreadMode
    ? [
        { page: pages[spreadStartIndex], pageIndex: spreadStartIndex, x: 0 },
        { page: pages[spreadStartIndex + 1], pageIndex: spreadStartIndex + 1, x: canvas.width + SPREAD_GAP },
      ]
    : [{ page: currentPage, pageIndex: currentPageIndex, x: 0 }];
  const stageWidth = isSpreadMode ? canvas.width * 2 + SPREAD_GAP : canvas.width;
  const stageHeight = canvas.height;

  const selectedFrame = useMemo(() => frames.find((frame) => frame.id === selectedFrameId) ?? null, [frames, selectedFrameId]);
  const selectedPhoto = useMemo(() => library.find((photo) => photo.id === selectedPhotoId) ?? null, [library, selectedPhotoId]);

  function showNotice(text) {
    setNotice(text);
    window.clearTimeout(showNotice.timer);
    showNotice.timer = window.setTimeout(() => setNotice(''), 2400);
  }

  function updatePageFrames(pageId, updater) {
    setAlbum((current) => ({
      ...current,
      pages: current.pages.map((page) => (page.id === pageId ? { ...page, frames: typeof updater === 'function' ? updater(page.frames) : updater } : page)),
    }));
  }

  function updateCurrentFrames(updater) {
    updatePageFrames(album.currentPageId, updater);
  }

  function updateFrameShape(pageId, frameId, patch) {
    updatePageFrames(pageId, (currentFrames) => {
      if (settings.frameMode === 'locked') return linkedGridChange(currentFrames, frameId, patch, canvas, Math.max(0, settings.gap));
      return currentFrames.map((frame) => (frame.id === frameId ? clampFrame({ ...frame, ...patch }, canvas) : frame));
    });
  }

  function rebuildFrames(nextCanvas = canvas, nextSettings = settings) {
    updateCurrentFrames((currentFrames) => createFrames(nextCanvas, nextSettings, currentFrames));
    setSelectedFrameId(null);
    setSelectedPhotoId(null);
  }

  function rebuildAllPages(nextCanvas = canvas, nextSettings = settings) {
    setAlbum((current) => ({
      ...current,
      pages: current.pages.map((page) => ({ ...page, frames: createFrames(nextCanvas, nextSettings, page.frames) })),
    }));
    setSelectedFrameId(null);
  }

  function updateSetting(key, value) {
    const nextSettings = { ...settings, [key]: value };
    setSettings(nextSettings);
    if (key === 'showGuides') return;
    if (key === 'frameMode') {
      if (value === 'locked') {
        updateCurrentFrames((currentFrames) => normalizeLinkedGrid(currentFrames, canvas, Math.max(0, settings.gap)));
        showNotice('Фиксация включена: тяни границу — соседнее окно меняется сразу.');
      }
      return;
    }
    rebuildAllPages(canvas, nextSettings);
  }

  function updateCanvasSize(width, height, presetId = settings.presetId) {
    const nextCanvas = { width: clampNumber(width, 300, 5000), height: clampNumber(height, 300, 5000) };
    const nextSettings = { ...settings, presetId };
    setCanvas(nextCanvas);
    setSettings(nextSettings);
    rebuildAllPages(nextCanvas, nextSettings);
  }

  function handlePresetChange(event) {
    const preset = CANVAS_PRESETS.find((item) => item.id === event.target.value) ?? CANVAS_PRESETS[0];
    updateCanvasSize(preset.width, preset.height, preset.id);
  }

  function handlePhotoUpload(event) {
    const files = Array.from(event.target.files ?? []);
    files.forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = () => setLibrary((current) => [...current, { id: createId(), name: file.name, src: reader.result }]);
      reader.readAsDataURL(file);
    });
    event.target.value = '';
  }

  function clearPhotoLibrary() {
    setLibrary([]);
    setSelectedPhotoId(null);
    showNotice('Список фото слева очищен. Фото на страницах остались.');
  }

  function putPhotoIntoFrame(pageId, frameId, photo) {
    updatePageFrames(pageId, (currentFrames) =>
      currentFrames.map((frame) =>
        frame.id === frameId
          ? { ...frame, photo: { id: photo.id, name: photo.name, src: photo.src, zoom: 1, offsetX: 0, offsetY: 0 } }
          : frame
      )
    );
    setAlbum((current) => ({ ...current, currentPageId: pageId }));
    setSelectedFrameId(frameId);
  }

  function pickPhoto(photo) {
    setSelectedPhotoId(photo.id);
    showNotice('Фото выбрано. Теперь нажми рамку на странице.');
  }

  function handleFrameSelect(pageId, frameId) {
    if (selectedPhoto) {
      putPhotoIntoFrame(pageId, frameId, selectedPhoto);
      setSelectedPhotoId(null);
      return;
    }
    setAlbum((current) => ({ ...current, currentPageId: pageId }));
    setSelectedFrameId(frameId);
  }

  function findDropTarget(point) {
    for (const entry of visibleEntries) {
      if (!entry.page) continue;
      const localX = point.x - entry.x;
      const localY = point.y;
      if (localX < 0 || localX > canvas.width || localY < 0 || localY > canvas.height) continue;
      const frame = entry.page.frames.find((item) => localX >= item.x && localX <= item.x + item.width && localY >= item.y && localY <= item.y + item.height);
      if (frame) return { pageId: entry.page.id, frameId: frame.id };
    }
    return null;
  }

  function handleCanvasDrop(event) {
    event.preventDefault();
    const photoId = event.dataTransfer.getData('photo-id');
    const photo = library.find((item) => item.id === photoId);
    if (!photo || !stageRef.current) return;
    stageRef.current.setPointersPositions(event);
    const point = stageRef.current.getPointerPosition();
    const target = point ? findDropTarget(point) : null;
    if (target) putPhotoIntoFrame(target.pageId, target.frameId, photo);
  }

  function updateFramePhoto(pageId, frameId, patch) {
    updatePageFrames(pageId, (currentFrames) => currentFrames.map((frame) => (frame.id === frameId && frame.photo ? { ...frame, photo: { ...frame.photo, ...patch } } : frame)));
  }

  function updateSelectedFrameGeometry(key, value) {
    if (!selectedFrame) return;
    updateFrameShape(album.currentPageId, selectedFrame.id, { [key]: value });
  }

  function removeSelectedPhoto() {
    if (!selectedFrame) return;
    updateCurrentFrames((currentFrames) => currentFrames.map((frame) => (frame.id === selectedFrame.id ? { ...frame, photo: null } : frame)));
  }

  function resetSelectedPhoto() {
    if (!selectedFrame?.photo) return;
    updateFramePhoto(album.currentPageId, selectedFrame.id, { zoom: 1, offsetX: 0, offsetY: 0 });
  }

  function clearCanvas() {
    updateCurrentFrames((currentFrames) => currentFrames.map((frame) => ({ ...frame, photo: null })));
    setSelectedFrameId(null);
    setSelectedPhotoId(null);
  }

  function selectPage(pageId) {
    setAlbum((current) => ({ ...current, currentPageId: pageId }));
    setSelectedFrameId(null);
    setSelectedPhotoId(null);
  }

  function addPage() {
    const page = createPage(canvas, settings, pages.length + 1);
    setAlbum((current) => {
      const index = current.pages.findIndex((item) => item.id === current.currentPageId);
      const nextPages = [...current.pages];
      nextPages.splice(index + 1, 0, page);
      return { ...current, pages: nextPages, currentPageId: page.id };
    });
    setViewMode('spread');
    setSelectedFrameId(null);
  }

  function duplicatePage() {
    if (!currentPage) return;
    const page = createPage(canvas, settings, pages.length + 1, cloneFrames(currentPage.frames));
    setAlbum((current) => {
      const index = current.pages.findIndex((item) => item.id === current.currentPageId);
      const nextPages = [...current.pages];
      nextPages.splice(index + 1, 0, page);
      return { ...current, pages: nextPages, currentPageId: page.id };
    });
    setViewMode('spread');
  }

  function deletePage() {
    if (pages.length <= 1) return;
    setAlbum((current) => {
      const index = current.pages.findIndex((page) => page.id === current.currentPageId);
      const nextPages = current.pages.filter((page) => page.id !== current.currentPageId);
      const nextCurrent = nextPages[Math.min(index, nextPages.length - 1)] ?? nextPages[0];
      return { pages: nextPages, currentPageId: nextCurrent.id };
    });
    setSelectedFrameId(null);
  }

  function movePage(direction) {
    setAlbum((current) => {
      const index = current.pages.findIndex((page) => page.id === current.currentPageId);
      const targetIndex = direction === 'left' ? index - 1 : index + 1;
      if (index < 0 || targetIndex < 0 || targetIndex >= current.pages.length) return current;
      const nextPages = [...current.pages];
      [nextPages[index], nextPages[targetIndex]] = [nextPages[targetIndex], nextPages[index]];
      return { ...current, pages: nextPages };
    });
  }

  function goToSpread(direction) {
    const nextIndex = direction === 'next' ? Math.min(pages.length - 1, spreadStartIndex + 2) : Math.max(0, spreadStartIndex - 2);
    selectPage(pages[nextIndex]?.id ?? pages[0].id);
    setViewMode('spread');
  }

  function createProject() {
    return { version: 11, canvas, settings, library, pages, currentPageId: album.currentPageId, viewMode, savedAt: new Date().toISOString() };
  }

  function saveProject() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(createProject()));
    showNotice('Альбом сохранён в браузере');
  }

  function normalizeLoadedPages(project, nextCanvas, nextSettings) {
    if (Array.isArray(project.pages) && project.pages.length) {
      return project.pages.map((page, index) => ({
        id: page.id ?? createId(),
        title: page.title ?? `Страница ${index + 1}`,
        frames: Array.isArray(page.frames) ? page.frames : createFrames(nextCanvas, nextSettings),
      }));
    }
    if (Array.isArray(project.frames)) return [createPage(nextCanvas, nextSettings, 1, project.frames)];
    return [createPage(nextCanvas, nextSettings, 1), createPage(nextCanvas, nextSettings, 2)];
  }

  function readSavedProject() {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) return current;
    for (const key of LEGACY_STORAGE_KEYS) {
      const legacy = localStorage.getItem(key);
      if (legacy) return legacy;
    }
    return null;
  }

  function loadProject() {
    const raw = readSavedProject();
    if (!raw) return showNotice('Сохранённого проекта пока нет');
    try {
      const project = JSON.parse(raw);
      const nextCanvas = project.canvas ?? DEFAULT_CANVAS;
      const nextSettings = { ...DEFAULT_SETTINGS, ...(project.settings ?? {}) };
      const nextPages = normalizeLoadedPages(project, nextCanvas, nextSettings);
      setCanvas(nextCanvas);
      setSettings(nextSettings);
      setLibrary(Array.isArray(project.library) ? project.library : []);
      setAlbum({ pages: nextPages, currentPageId: nextPages.some((page) => page.id === project.currentPageId) ? project.currentPageId : nextPages[0].id });
      setViewMode(project.viewMode === 'single' ? 'single' : 'spread');
      setSelectedFrameId(null);
      setSelectedPhotoId(null);
    } catch {
      showNotice('Не получилось открыть сохранение');
    }
  }

  function exportJson() {
    downloadText('collage-album-project.json', JSON.stringify(createProject(), null, 2));
  }

  function importJson(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const project = JSON.parse(reader.result);
        const nextCanvas = project.canvas ?? DEFAULT_CANVAS;
        const nextSettings = { ...DEFAULT_SETTINGS, ...(project.settings ?? {}) };
        const nextPages = normalizeLoadedPages(project, nextCanvas, nextSettings);
        setCanvas(nextCanvas);
        setSettings(nextSettings);
        setLibrary(Array.isArray(project.library) ? project.library : []);
        setAlbum({ pages: nextPages, currentPageId: nextPages[0].id });
        setViewMode(project.viewMode === 'single' ? 'single' : 'spread');
        setSelectedFrameId(null);
        setSelectedPhotoId(null);
      } catch {
        showNotice('Файл не похож на проект коллажа');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  function exportFromStage(stageRefToExport, filename, successText) {
    setSelectedFrameId(null);
    setSelectedPhotoId(null);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const uri = stageRefToExport.current?.toDataURL({ pixelRatio: EXPORT_PIXEL_RATIO, mimeType: 'image/png' });
        if (!uri) return showNotice('Не получилось собрать PNG');
        downloadDataUrl(filename, uri);
        showNotice(successText);
      });
    });
  }

  function exportCurrentPagePng() {
    const pageNumber = currentPageIndex + 1;
    exportFromStage(printPageStageRef, `collage-page-${padNumber(pageNumber)}.png`, `Скачана страница ${pageNumber}`);
  }

  function exportSpreadPng() {
    const first = spreadStartIndex + 1;
    const second = spreadEndIndex + 1;
    exportFromStage(printSpreadStageRef, `collage-spread-${padNumber(first)}-${padNumber(second)}.png`, `Скачан разворот ${first}–${second}`);
  }

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      const tagName = document.activeElement?.tagName?.toLowerCase();
      if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') return;
      removeSelectedPhoto();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFrame]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Редактор альбома</p>
          <h1>Collage Creator</h1>
        </div>
        <div className="topbar-actions">
          <button className="button" onClick={saveProject}>Сохранить</button>
          <button className="button" onClick={loadProject}>Открыть</button>
          <button className="button" onClick={exportJson}>Скачать JSON</button>
          <button className="button" onClick={() => jsonInputRef.current?.click()}>Загрузить JSON</button>
          <input ref={jsonInputRef} className="hidden-input" type="file" accept="application/json" onChange={importJson} />
          <button className="button accent" onClick={exportCurrentPagePng}>PNG страницы</button>
          <button className="button accent" onClick={exportSpreadPng}>PNG разворота</button>
        </div>
      </header>

      {notice && <div className="notice">{notice}</div>}

      <section className="settings-bar">
        <label className="field wide-field">
          <span>Размер страницы</span>
          <select value={settings.presetId} onChange={handlePresetChange}>
            {CANVAS_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
          </select>
        </label>
        <label className="field small-field"><span>Ширина px</span><input type="number" min="300" max="5000" value={canvas.width} onChange={(event) => updateCanvasSize(event.target.value, canvas.height, 'custom')} /></label>
        <label className="field small-field"><span>Высота px</span><input type="number" min="300" max="5000" value={canvas.height} onChange={(event) => updateCanvasSize(canvas.width, event.target.value, 'custom')} /></label>
        <label className="field small-field">
          <span>Фото-окон</span>
          <select value={settings.frameCount} onChange={(event) => updateSetting('frameCount', Number(event.target.value))}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((count) => <option key={count} value={count}>{count}</option>)}
          </select>
        </label>
        <label className="field small-field"><span>Зазор</span><input type="number" min="0" max="200" value={settings.gap} onChange={(event) => updateSetting('gap', clampNumber(event.target.value, 0, 200))} /></label>
        <label className="field small-field"><span>Поля</span><input type="number" min="0" max="300" value={settings.padding} onChange={(event) => updateSetting('padding', clampNumber(event.target.value, 0, 300))} /></label>
      </section>

      <section className="album-bar">
        <div className="album-head">
          <strong>Страницы альбома</strong>
          <span>{isSpreadMode ? `Разворот ${spreadStartIndex + 1}–${Math.min(spreadStartIndex + 2, pages.length)}` : `Страница ${currentPageIndex + 1} из ${pages.length}`}</span>
        </div>
        <div className="view-switch">
          <button className={`small-button ${!isSpreadMode ? 'active-mode' : ''}`} onClick={() => setViewMode('single')}>Страница</button>
          <button className={`small-button ${isSpreadMode ? 'active-mode' : ''}`} onClick={() => setViewMode('spread')}>Разворот / 2 страницы</button>
        </div>
        <div className="album-actions">
          <button className="small-button" onClick={addPage}>+ Страница</button>
          <button className="small-button" onClick={duplicatePage}>Копия</button>
          <button className="small-button" onClick={() => movePage('left')} disabled={currentPageIndex === 0}>←</button>
          <button className="small-button" onClick={() => movePage('right')} disabled={currentPageIndex === pages.length - 1}>→</button>
          <button className="small-button danger" onClick={deletePage}>Удалить</button>
        </div>
        <div className="spread-actions">
          <button className="small-button" onClick={() => goToSpread('prev')} disabled={spreadStartIndex === 0}>← разворот</button>
          <button className="small-button" onClick={() => goToSpread('next')} disabled={spreadStartIndex + 2 >= pages.length}>разворот →</button>
          <button className={`small-button ${settings.showGuides ? 'active-mode' : ''}`} onClick={() => updateSetting('showGuides', !settings.showGuides)}>{settings.showGuides ? 'Скрыть направляющие' : 'Показать направляющие'}</button>
          <button className={`small-button ${locked ? 'active-mode' : ''}`} onClick={() => updateSetting('frameMode', locked ? 'free' : 'locked')}>{locked ? 'Фиксация: включена' : 'Включить фиксацию'}</button>
        </div>
        <div className="page-strip">
          {pages.map((page, index) => (
            <button key={page.id} type="button" className={`page-chip ${page.id === album.currentPageId ? 'active-page-chip' : ''}`} onClick={() => selectPage(page.id)}>
              <b>{index + 1}</b>
              <span>{page.frames.filter((frame) => frame.photo).length}/{page.frames.length}</span>
              <small>{index % 2 === 0 ? 'левая' : 'правая'}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="workspace three-columns">
        <aside className="sidebar">
          <div className="panel-title"><div><h2>Фото</h2><p>На компьютере можно перетаскивать. На телефоне: нажми фото, потом нажми рамку.</p></div><span>{library.length}</span></div>
          <label className="upload-box"><strong>Загрузить фото</strong><small>Можно сразу несколько</small><input type="file" accept="image/*" multiple onChange={handlePhotoUpload} /></label>
          <button className="button full" onClick={clearPhotoLibrary} disabled={library.length === 0}>Очистить список фото</button>
          {selectedPhoto && <div className="mobile-pick-hint">Выбрано фото. Теперь нажми рамку на странице.</div>}
          {library.length === 0 ? (
            <div className="empty-state"><p>Пока фото нет. Нажми “Загрузить фото” и добавь изображения для коллажа.</p></div>
          ) : (
            <div className="photo-grid">
              {library.map((photo) => (
                <button key={photo.id} type="button" className={`photo-card ${photo.id === selectedPhotoId ? 'selected-photo-card' : ''}`} draggable onClick={() => pickPhoto(photo)} onDragStart={(event) => { event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData('photo-id', photo.id); }}>
                  <img src={photo.src} alt={photo.name} draggable="false" />
                  <span>{photo.name}</span>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className={`canvas-area ${isSpreadMode ? 'album-mode' : ''}`}>
          <div className="canvas-toolbar">
            <div>
              <strong>{isSpreadMode ? `Разворот · страницы ${spreadStartIndex + 1}–${Math.min(spreadStartIndex + 2, pages.length)}` : `Страница ${currentPageIndex + 1}`} · {canvas.width}×{canvas.height}px</strong>
              <span>{locked ? 'Фиксация: тяни границу окна — соседнее окно сразу сжимается/расширяется, зазор остаётся постоянным.' : 'Свободные рамки: пустые окна можно двигать, заполненные окна кадрируются перетаскиванием фото.'}</span>
              <em>Экспорт: “PNG страницы” сохраняет одну страницу, “PNG разворота” склеивает две страницы в один файл без зазора.</em>
            </div>
            <button className="small-button" onClick={() => rebuildFrames()}>Перестроить рамки</button>
            <button className="small-button" onClick={clearCanvas}>Очистить фото</button>
          </div>

          <div className={`stage-frame ${isSpreadMode ? 'album-preview' : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={handleCanvasDrop}>
            <Stage ref={stageRef} width={stageWidth} height={stageHeight} onMouseDown={(event) => { if (event.target === event.target.getStage() || event.target.name() === 'background') setSelectedFrameId(null); }} onTouchStart={(event) => { if (event.target === event.target.getStage() || event.target.name() === 'background') setSelectedFrameId(null); }}>
              <Layer>
                {visibleEntries.map((entry) => (
                  <PageLayer key={`${entry.page?.id ?? 'empty'}-${entry.pageIndex}`} page={entry.page} pageIndex={entry.pageIndex} x={entry.x} canvas={canvas} settings={settings} isActive={entry.page?.id === album.currentPageId} selectedFrameId={selectedFrameId} onFrameSelect={handleFrameSelect} onPhotoMove={updateFramePhoto} onFrameChange={updateFrameShape} />
                ))}
                {isSpreadMode && settings.showGuides && <Line points={[canvas.width + SPREAD_GAP / 2, 0, canvas.width + SPREAD_GAP / 2, canvas.height]} stroke={locked ? '#2f7d52' : '#c27b4f'} strokeWidth={3} dash={[24, 18]} opacity={0.55} listening={false} />}
              </Layer>
            </Stage>
          </div>
        </section>

        <aside className="inspector">
          <div className="panel-title compact"><div><h2>Настройки окна</h2><p>{selectedFrame ? 'Тяни рамку за углы или стороны. Фото внутри двигай мышкой.' : 'Выбери рамку на холсте'}</p></div></div>
          <div className="inspector-block">
            <h3>Цвет и рамка</h3>
            <label className="field color-field"><span>Цвет фона / рамки</span><input type="color" value={settings.borderColor} onChange={(event) => updateSetting('borderColor', event.target.value)} /></label>
            <label className="field"><span>Обводка внутри окна</span><input type="number" min="0" max="80" value={settings.borderWidth} onChange={(event) => updateSetting('borderWidth', clampNumber(event.target.value, 0, 80))} /></label>
          </div>

          {selectedFrame ? (
            <>
              <div className="inspector-block">
                <h3>Положение рамки</h3>
                <div className="geometry-grid">
                  <label className="field"><span>X</span><input type="number" value={selectedFrame.x} onChange={(event) => updateSelectedFrameGeometry('x', event.target.value)} /></label>
                  <label className="field"><span>Y</span><input type="number" value={selectedFrame.y} onChange={(event) => updateSelectedFrameGeometry('y', event.target.value)} /></label>
                  <label className="field"><span>Ширина</span><input type="number" value={selectedFrame.width} onChange={(event) => updateSelectedFrameGeometry('width', event.target.value)} /></label>
                  <label className="field"><span>Высота</span><input type="number" value={selectedFrame.height} onChange={(event) => updateSelectedFrameGeometry('height', event.target.value)} /></label>
                </div>
                <p className="hint">Режим: {locked ? 'фиксация — общие границы меняются сразу, зазор постоянный' : selectedFrame.photo ? 'кадрирование фото внутри окна' : 'свободное окно можно двигать мышкой'}.</p>
              </div>
              <div className="inspector-block">
                <h3>Фото внутри окна</h3>
                {selectedFrame.photo ? (
                  <>
                    <p className="photo-name">{selectedFrame.photo.name}</p>
                    <label className="range-row"><span>Масштаб</span><input type="range" min="1" max="3" step="0.01" value={selectedFrame.photo.zoom} onChange={(event) => updateFramePhoto(album.currentPageId, selectedFrame.id, { zoom: Number(event.target.value) })} /><b>{selectedFrame.photo.zoom.toFixed(2)}</b></label>
                    <button className="button full" onClick={resetSelectedPhoto}>Центрировать фото</button>
                    <button className="button full danger-button" onClick={removeSelectedPhoto}>Убрать фото из окна</button>
                  </>
                ) : <p className="hint">Нажми фото слева, потом нажми эту рамку.</p>}
              </div>
            </>
          ) : <div className="empty-state small-empty"><p>Нажми на любое окно коллажа, чтобы настроить фото, масштаб и форму рамки.</p></div>}
        </aside>
      </section>

      <div className="export-stage-holder" aria-hidden="true">
        <Stage ref={printPageStageRef} width={canvas.width} height={canvas.height}>
          <Layer><PageLayer page={currentPage} pageIndex={currentPageIndex} x={0} canvas={canvas} settings={settings} isActive={false} selectedFrameId={null} printMode onFrameSelect={() => {}} onPhotoMove={() => {}} onFrameChange={() => {}} /></Layer>
        </Stage>
        <Stage ref={printSpreadStageRef} width={canvas.width * 2} height={canvas.height}>
          <Layer>
            <PageLayer page={pages[spreadStartIndex]} pageIndex={spreadStartIndex} x={0} canvas={canvas} settings={settings} isActive={false} selectedFrameId={null} printMode onFrameSelect={() => {}} onPhotoMove={() => {}} onFrameChange={() => {}} />
            <PageLayer page={pages[spreadStartIndex + 1]} pageIndex={spreadStartIndex + 1} x={canvas.width} canvas={canvas} settings={settings} isActive={false} selectedFrameId={null} printMode onFrameSelect={() => {}} onPhotoMove={() => {}} onFrameChange={() => {}} />
          </Layer>
        </Stage>
      </div>
    </main>
  );
}
