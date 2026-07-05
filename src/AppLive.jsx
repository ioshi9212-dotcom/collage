import { useEffect, useMemo, useRef, useState } from 'react';
import { Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva';

const STORAGE_KEY = 'collage-creator-album-live-v2';
const LEGACY_KEYS = [
  'collage-creator-album-live-v1',
  'collage-creator-album-v11',
  'collage-creator-album-v10',
  'collage-creator-album-v9',
  'collage-creator-album-v8',
  'collage-creator-album-v7',
  'collage-creator-album-v6',
  'collage-creator-album-v5',
  'collage-creator-album-v4',
];
const MIN_FRAME = 80;
const SPREAD_GAP = 90;
const EXPORT_RATIO = 2;
const HANDLE = 22;

const PRESETS = [
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

function id() {
  return globalThis.crypto?.randomUUID?.() ?? `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function downloadDataUrl(filename, dataUrl) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function downloadText(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
  downloadDataUrl(filename, url);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function loadImage(src) {
  if (imageCache.has(src)) return Promise.resolve(imageCache.get(src));
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      imageCache.set(src, image);
      resolve(image);
    };
    image.onerror = reject;
    image.src = src;
  });
}

function layoutRows(count) {
  return {
    1: [1],
    2: [2],
    3: [2, 1],
    4: [2, 2],
    5: [2, 2, 1],
    6: [3, 3],
    7: [3, 3, 1],
    8: [4, 4],
    9: [3, 3, 3],
  }[count] ?? [2, 2, 1];
}

function createFrames(canvas, settings, previous = []) {
  const rows = layoutRows(settings.frameCount);
  const padding = Math.min(settings.padding, Math.floor(canvas.width / 3), Math.floor(canvas.height / 3));
  const gap = Math.max(0, settings.gap);
  const innerWidth = Math.max(40, canvas.width - padding * 2);
  const innerHeight = Math.max(40, canvas.height - padding * 2);
  const rowHeight = (innerHeight - gap * (rows.length - 1)) / rows.length;
  const frames = [];

  rows.forEach((columns, rowIndex) => {
    const width = (innerWidth - gap * (columns - 1)) / columns;
    for (let column = 0; column < columns; column += 1) {
      const old = previous[frames.length];
      frames.push({
        id: old?.id ?? `frame_${frames.length + 1}`,
        x: Math.round(padding + column * (width + gap)),
        y: Math.round(padding + rowIndex * (rowHeight + gap)),
        width: Math.round(width),
        height: Math.round(rowHeight),
        photo: old?.photo ?? null,
      });
    }
  });

  return frames.slice(0, settings.frameCount);
}

function createPage(canvas, settings, number, frames) {
  return { id: id(), title: `Страница ${number}`, frames: frames ?? createFrames(canvas, settings) };
}

function cloneFrames(frames) {
  return frames.map((frame, index) => ({ ...frame, id: `frame_${index + 1}`, photo: frame.photo ? { ...frame.photo } : null }));
}

function cleanFrame(frame, canvas) {
  const width = clamp(Math.round(Number(frame.width)), MIN_FRAME, canvas.width);
  const height = clamp(Math.round(Number(frame.height)), MIN_FRAME, canvas.height);
  return {
    ...frame,
    width,
    height,
    x: clamp(Math.round(Number(frame.x)), 0, Math.max(0, canvas.width - width)),
    y: clamp(Math.round(Number(frame.y)), 0, Math.max(0, canvas.height - height)),
  };
}

function coverRect(image, frame, photo) {
  if (!image || !photo) return null;
  const zoom = photo.zoom ?? 1;
  const scale = Math.max(frame.width / image.width, frame.height / image.height) * zoom;
  const width = image.width * scale;
  const height = image.height * scale;
  const baseX = (frame.width - width) / 2;
  const baseY = (frame.height - height) / 2;
  return {
    x: baseX + (photo.offsetX ?? 0),
    y: baseY + (photo.offsetY ?? 0),
    width,
    height,
    baseX,
    baseY,
  };
}

function clampPhoto(rect, frame, x, y) {
  if (!rect) return { x, y };
  return {
    x: clamp(x, Math.min(0, frame.width - rect.width), 0),
    y: clamp(y, Math.min(0, frame.height - rect.height), 0),
  };
}

function overlap(startA, endA, startB, endB) {
  return Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
}

function verticalPairs(frames, gap) {
  const tol = Math.max(4, gap / 2 + 4);
  const pairs = [];
  frames.forEach((left) => {
    frames.forEach((right) => {
      if (left.id === right.id) return;
      if (Math.abs(left.x + left.width + gap - right.x) > tol) return;
      const y1 = Math.max(left.y, right.y);
      const y2 = Math.min(left.y + left.height, right.y + right.height);
      if (y2 - y1 < MIN_FRAME / 2) return;
      pairs.push({ leftId: left.id, rightId: right.id, center: left.x + left.width + gap / 2, y: y1, height: y2 - y1 });
    });
  });
  return pairs;
}

function horizontalPairs(frames, gap) {
  const tol = Math.max(4, gap / 2 + 4);
  const pairs = [];
  frames.forEach((top) => {
    frames.forEach((bottom) => {
      if (top.id === bottom.id) return;
      if (Math.abs(top.y + top.height + gap - bottom.y) > tol) return;
      const x1 = Math.max(top.x, bottom.x);
      const x2 = Math.min(top.x + top.width, bottom.x + bottom.width);
      if (x2 - x1 < MIN_FRAME / 2) return;
      pairs.push({ topId: top.id, bottomId: bottom.id, center: top.y + top.height + gap / 2, x: x1, width: x2 - x1 });
    });
  });
  return pairs;
}

function moveVerticalBoundary(frames, leftId, rightId, center, gap) {
  const left = frames.find((frame) => frame.id === leftId);
  const right = frames.find((frame) => frame.id === rightId);
  if (!left || !right) return frames;
  const rightEdge = right.x + right.width;
  const boundary = clamp(Math.round(center - gap / 2), left.x + MIN_FRAME, rightEdge - gap - MIN_FRAME);
  return frames.map((frame) => {
    if (frame.id === leftId) return { ...frame, width: boundary - left.x };
    if (frame.id === rightId) {
      const nextX = boundary + gap;
      return { ...frame, x: nextX, width: rightEdge - nextX };
    }
    return frame;
  });
}

function moveHorizontalBoundary(frames, topId, bottomId, center, gap) {
  const top = frames.find((frame) => frame.id === topId);
  const bottom = frames.find((frame) => frame.id === bottomId);
  if (!top || !bottom) return frames;
  const bottomEdge = bottom.y + bottom.height;
  const boundary = clamp(Math.round(center - gap / 2), top.y + MIN_FRAME, bottomEdge - gap - MIN_FRAME);
  return frames.map((frame) => {
    if (frame.id === topId) return { ...frame, height: boundary - top.y };
    if (frame.id === bottomId) {
      const nextY = boundary + gap;
      return { ...frame, y: nextY, height: bottomEdge - nextY };
    }
    return frame;
  });
}

function PhotoImage({ frame, selected, image, rect, printMode, onSelect, onPhotoMove }) {
  if (!frame.photo || !rect) return null;

  return (
    <KonvaImage
      image={image}
      x={rect.x}
      y={rect.y}
      width={rect.width}
      height={rect.height}
      draggable={!printMode && selected}
      onMouseDown={(event) => {
        event.cancelBubble = true;
        onSelect();
      }}
      onTap={(event) => {
        event.cancelBubble = true;
        onSelect();
      }}
      onDragStart={(event) => {
        event.cancelBubble = true;
      }}
      onDragMove={(event) => {
        event.cancelBubble = true;
        const next = clampPhoto(rect, frame, event.target.x(), event.target.y());
        event.target.x(next.x);
        event.target.y(next.y);
      }}
      onDragEnd={(event) => {
        event.cancelBubble = true;
        const next = clampPhoto(rect, frame, event.target.x(), event.target.y());
        event.target.x(next.x);
        event.target.y(next.y);
        onPhotoMove(frame.id, {
          offsetX: Math.round(next.x - rect.baseX),
          offsetY: Math.round(next.y - rect.baseY),
        });
      }}
    />
  );
}

function CollageFrame({ frame, selected, locked, borderWidth, borderColor, printMode, canvas, onSelect, onPhotoMove, onFrameChange }) {
  const [image, setImage] = useState(null);
  const groupRef = useRef(null);
  const transformerRef = useRef(null);
  const photo = frame.photo;
  const rect = coverRect(image, frame, photo);
  const canDragFrame = !printMode && selected && !locked && !photo;

  useEffect(() => {
    let active = true;
    if (!photo?.src) {
      setImage(null);
      return () => {
        active = false;
      };
    }
    loadImage(photo.src).then((loaded) => active && setImage(loaded)).catch(() => active && setImage(null));
    return () => {
      active = false;
    };
  }, [photo?.src]);

  useEffect(() => {
    if (!transformerRef.current || !groupRef.current) return;
    transformerRef.current.nodes(selected && !printMode && !locked ? [groupRef.current] : []);
    transformerRef.current.getLayer()?.batchDraw();
  }, [selected, printMode, locked, frame.x, frame.y, frame.width, frame.height]);

  function commitDrag(event) {
    if (printMode || !selected || locked || photo) return;
    onFrameChange(frame.id, { x: event.target.x(), y: event.target.y() });
  }

  function commitTransform() {
    if (printMode || !selected || locked || !groupRef.current) return;
    const node = groupRef.current;
    const patch = {
      x: node.x(),
      y: node.y(),
      width: frame.width * node.scaleX(),
      height: frame.height * node.scaleY(),
    };
    node.scaleX(1);
    node.scaleY(1);
    onFrameChange(frame.id, patch);
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
        onDragEnd={commitDrag}
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

          <PhotoImage frame={frame} selected={selected} image={image} rect={rect} printMode={printMode} onSelect={onSelect} onPhotoMove={onPhotoMove} />

          {!photo && !printMode && (
            <Rect x={14} y={14} width={Math.max(0, frame.width - 28)} height={Math.max(0, frame.height - 28)} stroke="#d8c7b9" strokeWidth={2} strokeScaleEnabled={false} dash={[14, 10]} cornerRadius={12} />
          )}
        </Group>
      </Group>

      {selected && !printMode && !locked && (
        <Transformer
          ref={transformerRef}
          rotateEnabled={false}
          keepRatio={false}
          flipEnabled={false}
          ignoreStroke
          enabledAnchors={['top-left', 'top-center', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right']}
          anchorSize={24}
          anchorCornerRadius={6}
          borderStroke="#c27b4f"
          borderStrokeWidth={3}
          anchorStroke="#c27b4f"
          anchorFill="#fff7ef"
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < MIN_FRAME || newBox.height < MIN_FRAME) return oldBox;
            if (newBox.x < 0 || newBox.y < 0 || newBox.x + newBox.width > canvas.width || newBox.y + newBox.height > canvas.height) return oldBox;
            return newBox;
          }}
        />
      )}
    </>
  );
}

function LockedHandles({ page, gap, onVerticalMove, onHorizontalMove, onActivate }) {
  if (!page) return null;
  const vertical = verticalPairs(page.frames, gap);
  const horizontal = horizontalPairs(page.frames, gap);

  return (
    <>
      {vertical.map((pair) => (
        <Rect
          key={`v-${pair.leftId}-${pair.rightId}`}
          x={pair.center - HANDLE / 2}
          y={pair.y}
          width={HANDLE}
          height={pair.height}
          fill="#2f7d52"
          opacity={0.18}
          draggable
          dragBoundFunc={(pos) => ({ x: pos.x, y: pair.y })}
          onMouseDown={onActivate}
          onTap={onActivate}
          onDragMove={(event) => onVerticalMove(pair.leftId, pair.rightId, event.target.x() + HANDLE / 2)}
          onDragEnd={(event) => onVerticalMove(pair.leftId, pair.rightId, event.target.x() + HANDLE / 2)}
        />
      ))}
      {horizontal.map((pair) => (
        <Rect
          key={`h-${pair.topId}-${pair.bottomId}`}
          x={pair.x}
          y={pair.center - HANDLE / 2}
          width={pair.width}
          height={HANDLE}
          fill="#2f7d52"
          opacity={0.18}
          draggable
          dragBoundFunc={(pos) => ({ x: pair.x, y: pos.y })}
          onMouseDown={onActivate}
          onTap={onActivate}
          onDragMove={(event) => onHorizontalMove(pair.topId, pair.bottomId, event.target.y() + HANDLE / 2)}
          onDragEnd={(event) => onHorizontalMove(pair.topId, pair.bottomId, event.target.y() + HANDLE / 2)}
        />
      ))}
    </>
  );
}

function PageLayer({ page, pageIndex, x, canvas, settings, activePageId, selectedFrameId, printMode = false, onFrameSelect, onPhotoMove, onFrameChange, onVerticalMove, onHorizontalMove, onActivatePage }) {
  const locked = settings.frameMode === 'locked';
  const safe = Math.min(settings.padding, Math.floor(canvas.width / 3), Math.floor(canvas.height / 3));

  if (!page) {
    return (
      <Group x={x} y={0}>
        <Rect name="background" x={0} y={0} width={canvas.width} height={canvas.height} fill={settings.borderColor} />
      </Group>
    );
  }

  return (
    <Group x={x} y={0}>
      <Rect name="background" x={0} y={0} width={canvas.width} height={canvas.height} fill={settings.borderColor} />
      {!printMode && settings.showGuides && (
        <>
          <Rect x={safe} y={safe} width={Math.max(0, canvas.width - safe * 2)} height={Math.max(0, canvas.height - safe * 2)} stroke={locked ? '#2f7d52' : '#c27b4f'} strokeWidth={2} strokeScaleEnabled={false} dash={[18, 14]} listening={false} />
          <Text x={safe + 16} y={safe + 16} text={locked ? 'фиксация: двигай зелёные разделители' : 'поля / безопасная зона'} fontSize={28} fill={locked ? '#2f7d52' : '#c27b4f'} opacity={0.62} listening={false} />
        </>
      )}
      {!printMode && <Text x={28} y={24} text={`Стр. ${pageIndex + 1}`} fontSize={34} fill={page.id === activePageId ? (locked ? '#2f7d52' : '#c27b4f') : '#b49a87'} fontStyle="bold" listening={false} />}

      {page.frames.map((frame) => (
        <CollageFrame
          key={frame.id}
          frame={frame}
          selected={!printMode && page.id === activePageId && frame.id === selectedFrameId}
          locked={locked}
          borderWidth={settings.borderWidth}
          borderColor={settings.borderColor}
          printMode={printMode}
          canvas={canvas}
          onSelect={() => !printMode && onFrameSelect(page.id, frame.id)}
          onPhotoMove={(frameId, patch) => !printMode && onPhotoMove(page.id, frameId, patch)}
          onFrameChange={(frameId, patch) => !printMode && onFrameChange(page.id, frameId, patch)}
        />
      ))}

      {!printMode && locked && (
        <LockedHandles
          page={page}
          gap={Math.max(0, settings.gap)}
          onActivate={() => onActivatePage(page.id)}
          onVerticalMove={(leftId, rightId, center) => onVerticalMove(page.id, leftId, rightId, center)}
          onHorizontalMove={(topId, bottomId, center) => onHorizontalMove(page.id, topId, bottomId, center)}
        />
      )}
    </Group>
  );
}

function initialAlbum() {
  const first = createPage(DEFAULT_CANVAS, DEFAULT_SETTINGS, 1);
  const second = createPage(DEFAULT_CANVAS, DEFAULT_SETTINGS, 2);
  return { pages: [first, second], currentPageId: first.id };
}

export default function App() {
  const stageRef = useRef(null);
  const printPageRef = useRef(null);
  const printSpreadRef = useRef(null);
  const jsonRef = useRef(null);
  const noticeTimerRef = useRef(null);

  const [album, setAlbum] = useState(initialAlbum);
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
  const spreadStart = currentPageIndex % 2 === 0 ? currentPageIndex : currentPageIndex - 1;
  const isSpread = viewMode === 'spread';
  const locked = settings.frameMode === 'locked';
  const stageWidth = isSpread ? canvas.width * 2 + SPREAD_GAP : canvas.width;
  const entries = isSpread
    ? [
        { page: pages[spreadStart], pageIndex: spreadStart, x: 0 },
        { page: pages[spreadStart + 1], pageIndex: spreadStart + 1, x: canvas.width + SPREAD_GAP },
      ]
    : [{ page: currentPage, pageIndex: currentPageIndex, x: 0 }];

  const selectedFrame = useMemo(() => currentPage?.frames.find((frame) => frame.id === selectedFrameId) ?? null, [currentPage, selectedFrameId]);
  const selectedPhoto = useMemo(() => library.find((photo) => photo.id === selectedPhotoId) ?? null, [library, selectedPhotoId]);

  function show(text) {
    setNotice(text);
    clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(''), 2500);
  }

  function updatePageFrames(pageId, updater) {
    setAlbum((current) => ({
      ...current,
      pages: current.pages.map((page) => (page.id === pageId ? { ...page, frames: typeof updater === 'function' ? updater(page.frames) : updater } : page)),
    }));
  }

  function changeFrame(pageId, frameId, patch) {
    updatePageFrames(pageId, (frames) => frames.map((frame) => (frame.id === frameId ? cleanFrame({ ...frame, ...patch }, canvas) : frame)));
  }

  function moveVertical(pageId, leftId, rightId, center) {
    setAlbum((current) => ({
      ...current,
      currentPageId: pageId,
      pages: current.pages.map((page) => (page.id === pageId ? { ...page, frames: moveVerticalBoundary(page.frames, leftId, rightId, center, Math.max(0, settings.gap)) } : page)),
    }));
  }

  function moveHorizontal(pageId, topId, bottomId, center) {
    setAlbum((current) => ({
      ...current,
      currentPageId: pageId,
      pages: current.pages.map((page) => (page.id === pageId ? { ...page, frames: moveHorizontalBoundary(page.frames, topId, bottomId, center, Math.max(0, settings.gap)) } : page)),
    }));
  }

  function rebuildAll(nextCanvas = canvas, nextSettings = settings) {
    setAlbum((current) => ({ ...current, pages: current.pages.map((page) => ({ ...page, frames: createFrames(nextCanvas, nextSettings, page.frames) })) }));
    setSelectedFrameId(null);
  }

  function rebuildCurrent(nextSettings = settings) {
    updatePageFrames(album.currentPageId, (frames) => createFrames(canvas, nextSettings, frames));
    setSelectedFrameId(null);
  }

  function updateSetting(key, value) {
    const next = { ...settings, [key]: value };
    setSettings(next);
    if (key === 'showGuides') return;
    if (key === 'frameMode') {
      if (value === 'locked') {
        rebuildCurrent(next);
        show('Фиксация включена: двигай зелёные разделители между окнами.');
      }
      return;
    }
    rebuildAll(canvas, next);
  }

  function updateCanvas(width, height, presetId = settings.presetId) {
    const nextCanvas = { width: clamp(width, 300, 5000), height: clamp(height, 300, 5000) };
    const nextSettings = { ...settings, presetId };
    setCanvas(nextCanvas);
    setSettings(nextSettings);
    rebuildAll(nextCanvas, nextSettings);
  }

  function uploadPhotos(event) {
    const files = Array.from(event.target.files ?? []);
    files.forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = () => setLibrary((current) => [...current, { id: id(), name: file.name, src: reader.result }]);
      reader.readAsDataURL(file);
    });
    event.target.value = '';
    if (files.length) show('Фото загружены');
  }

  function putPhoto(pageId, frameId, photo) {
    updatePageFrames(pageId, (frames) => frames.map((frame) => (frame.id === frameId ? { ...frame, photo: { id: photo.id, name: photo.name, src: photo.src, zoom: 1, offsetX: 0, offsetY: 0 } } : frame)));
    setAlbum((current) => ({ ...current, currentPageId: pageId }));
    setSelectedFrameId(frameId);
  }

  function selectFrame(pageId, frameId) {
    if (selectedPhoto) {
      putPhoto(pageId, frameId, selectedPhoto);
      setSelectedPhotoId(null);
      show('Фото вставлено');
      return;
    }
    setAlbum((current) => ({ ...current, currentPageId: pageId }));
    setSelectedFrameId(frameId);
  }

  function dropPhoto(event) {
    event.preventDefault();
    const photo = library.find((item) => item.id === event.dataTransfer.getData('photo-id'));
    if (!photo || !stageRef.current) return;
    stageRef.current.setPointersPositions(event);
    const point = stageRef.current.getPointerPosition();
    if (!point) return;

    for (const entry of entries) {
      if (!entry.page) continue;
      const x = point.x - entry.x;
      const y = point.y;
      const frame = entry.page.frames.find((item) => x >= item.x && x <= item.x + item.width && y >= item.y && y <= item.y + item.height);
      if (frame) {
        putPhoto(entry.page.id, frame.id, photo);
        return;
      }
    }
    show('Перетащи фото прямо в рамку');
  }

  function updatePhoto(pageId, frameId, patch) {
    updatePageFrames(pageId, (frames) => frames.map((frame) => (frame.id === frameId && frame.photo ? { ...frame, photo: { ...frame.photo, ...patch } } : frame)));
  }

  function addPage() {
    const page = createPage(canvas, settings, pages.length + 1);
    setAlbum((current) => {
      const index = current.pages.findIndex((item) => item.id === current.currentPageId);
      const next = [...current.pages];
      next.splice(index + 1, 0, page);
      return { pages: next, currentPageId: page.id };
    });
    setViewMode('spread');
  }

  function duplicatePage() {
    if (!currentPage) return;
    const page = createPage(canvas, settings, pages.length + 1, cloneFrames(currentPage.frames));
    setAlbum((current) => {
      const index = current.pages.findIndex((item) => item.id === current.currentPageId);
      const next = [...current.pages];
      next.splice(index + 1, 0, page);
      return { pages: next, currentPageId: page.id };
    });
  }

  function deletePage() {
    if (pages.length <= 1) return show('Нельзя удалить единственную страницу');
    setAlbum((current) => {
      const index = current.pages.findIndex((page) => page.id === current.currentPageId);
      const next = current.pages.filter((page) => page.id !== current.currentPageId);
      return { pages: next, currentPageId: next[Math.min(index, next.length - 1)].id };
    });
  }

  function movePage(direction) {
    setAlbum((current) => {
      const index = current.pages.findIndex((page) => page.id === current.currentPageId);
      const target = direction === 'left' ? index - 1 : index + 1;
      if (target < 0 || target >= current.pages.length) return current;
      const next = [...current.pages];
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, pages: next };
    });
  }

  function goSpread(direction) {
    const next = direction === 'next' ? Math.min(pages.length - 1, spreadStart + 2) : Math.max(0, spreadStart - 2);
    setAlbum((current) => ({ ...current, currentPageId: pages[next]?.id ?? pages[0].id }));
  }

  function project() {
    return { version: 'live-2', canvas, settings, library, pages, currentPageId: album.currentPageId, viewMode, savedAt: new Date().toISOString() };
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project()));
    show('Альбом сохранён');
  }

  function normalizedPages(data, nextCanvas, nextSettings) {
    if (Array.isArray(data.pages) && data.pages.length) return data.pages.map((page, index) => ({ id: page.id ?? id(), title: page.title ?? `Страница ${index + 1}`, frames: Array.isArray(page.frames) ? page.frames.map((frame) => cleanFrame(frame, nextCanvas)) : createFrames(nextCanvas, nextSettings) }));
    if (Array.isArray(data.frames)) return [createPage(nextCanvas, nextSettings, 1, data.frames.map((frame) => cleanFrame(frame, nextCanvas)))];
    return [createPage(nextCanvas, nextSettings, 1), createPage(nextCanvas, nextSettings, 2)];
  }

  function loadSaved() {
    const raw = localStorage.getItem(STORAGE_KEY) ?? LEGACY_KEYS.map((key) => localStorage.getItem(key)).find(Boolean);
    if (!raw) return show('Сохранённого проекта пока нет');
    try {
      const data = JSON.parse(raw);
      const nextCanvas = data.canvas ?? DEFAULT_CANVAS;
      const nextSettings = { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) };
      const nextPages = normalizedPages(data, nextCanvas, nextSettings);
      setCanvas(nextCanvas);
      setSettings(nextSettings);
      setLibrary(Array.isArray(data.library) ? data.library : []);
      setAlbum({ pages: nextPages, currentPageId: nextPages.some((page) => page.id === data.currentPageId) ? data.currentPageId : nextPages[0].id });
      setViewMode(data.viewMode === 'single' ? 'single' : 'spread');
      setSelectedFrameId(null);
      setSelectedPhotoId(null);
      show('Альбом загружен');
    } catch {
      show('Не получилось открыть сохранение');
    }
  }

  function importJson(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const nextCanvas = data.canvas ?? DEFAULT_CANVAS;
        const nextSettings = { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) };
        const nextPages = normalizedPages(data, nextCanvas, nextSettings);
        setCanvas(nextCanvas);
        setSettings(nextSettings);
        setLibrary(Array.isArray(data.library) ? data.library : []);
        setAlbum({ pages: nextPages, currentPageId: nextPages[0].id });
        setViewMode(data.viewMode === 'single' ? 'single' : 'spread');
        show('JSON открыт');
      } catch {
        show('Файл не похож на проект');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  function exportPng(stageRefToExport, filename, message) {
    setSelectedFrameId(null);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const uri = stageRefToExport.current?.toDataURL({ pixelRatio: EXPORT_RATIO, mimeType: 'image/png' });
      if (!uri) return show('Не получилось собрать PNG');
      downloadDataUrl(filename, uri);
      show(message);
    }));
  }

  const renderEntries = entries.map((entry) => entry.page && (
    <PageLayer
      key={`${entry.page.id}-${entry.pageIndex}`}
      page={entry.page}
      pageIndex={entry.pageIndex}
      x={entry.x}
      canvas={canvas}
      settings={settings}
      activePageId={album.currentPageId}
      selectedFrameId={selectedFrameId}
      onFrameSelect={selectFrame}
      onPhotoMove={updatePhoto}
      onFrameChange={changeFrame}
      onVerticalMove={moveVertical}
      onHorizontalMove={moveHorizontal}
      onActivatePage={(pageId) => setAlbum((current) => ({ ...current, currentPageId: pageId }))}
    />
  ));

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Редактор альбома</p>
          <h1>Collage Creator</h1>
        </div>
        <div className="topbar-actions">
          <button className="button" onClick={save}>Сохранить</button>
          <button className="button" onClick={loadSaved}>Открыть</button>
          <button className="button" onClick={() => downloadText('collage-album-project.json', JSON.stringify(project(), null, 2))}>Скачать JSON</button>
          <button className="button" onClick={() => jsonRef.current?.click()}>Загрузить JSON</button>
          <input ref={jsonRef} className="hidden-input" type="file" accept="application/json" onChange={importJson} />
          <button className="button accent" onClick={() => exportPng(printPageRef, `collage-page-${pad(currentPageIndex + 1)}.png`, 'Скачана страница')}>PNG страницы</button>
          <button className="button accent" onClick={() => exportPng(printSpreadRef, `collage-spread-${pad(spreadStart + 1)}-${pad(Math.min(spreadStart + 2, pages.length))}.png`, 'Скачан разворот')}>PNG разворота</button>
        </div>
      </header>

      {notice && <div className="notice">{notice}</div>}

      <section className="settings-bar">
        <label className="field wide-field"><span>Размер страницы</span><select value={settings.presetId} onChange={(event) => { const preset = PRESETS.find((item) => item.id === event.target.value) ?? PRESETS[0]; updateCanvas(preset.width, preset.height, preset.id); }}>{PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select></label>
        <label className="field small-field"><span>Ширина px</span><input type="number" value={canvas.width} onChange={(event) => updateCanvas(event.target.value, canvas.height, 'custom')} /></label>
        <label className="field small-field"><span>Высота px</span><input type="number" value={canvas.height} onChange={(event) => updateCanvas(canvas.width, event.target.value, 'custom')} /></label>
        <label className="field small-field"><span>Фото-окон</span><select value={settings.frameCount} onChange={(event) => updateSetting('frameCount', Number(event.target.value))}>{[1,2,3,4,5,6,7,8,9].map((count) => <option key={count} value={count}>{count}</option>)}</select></label>
        <label className="field small-field"><span>Зазор</span><input type="number" value={settings.gap} onChange={(event) => updateSetting('gap', clamp(event.target.value, 0, 200))} /></label>
        <label className="field small-field"><span>Поля</span><input type="number" value={settings.padding} onChange={(event) => updateSetting('padding', clamp(event.target.value, 0, 300))} /></label>
      </section>

      <section className="album-bar">
        <div className="album-head"><strong>Страницы альбома</strong><span>{isSpread ? `Разворот ${spreadStart + 1}–${Math.min(spreadStart + 2, pages.length)}` : `Страница ${currentPageIndex + 1} из ${pages.length}`}</span></div>
        <div className="view-switch"><button className={`small-button ${!isSpread ? 'active-mode' : ''}`} onClick={() => setViewMode('single')}>Страница</button><button className={`small-button ${isSpread ? 'active-mode' : ''}`} onClick={() => setViewMode('spread')}>Разворот / 2 страницы</button></div>
        <div className="album-actions"><button className="small-button" onClick={addPage}>+ Страница</button><button className="small-button" onClick={duplicatePage}>Копия</button><button className="small-button" onClick={() => movePage('left')} disabled={currentPageIndex === 0}>←</button><button className="small-button" onClick={() => movePage('right')} disabled={currentPageIndex === pages.length - 1}>→</button><button className="small-button danger" onClick={deletePage}>Удалить</button></div>
        <div className="spread-actions"><button className="small-button" onClick={() => goSpread('prev')} disabled={spreadStart === 0}>← разворот</button><button className="small-button" onClick={() => goSpread('next')} disabled={spreadStart + 2 >= pages.length}>разворот →</button><button className={`small-button ${settings.showGuides ? 'active-mode' : ''}`} onClick={() => updateSetting('showGuides', !settings.showGuides)}>{settings.showGuides ? 'Скрыть направляющие' : 'Показать направляющие'}</button><button className={`small-button ${locked ? 'active-mode' : ''}`} onClick={() => updateSetting('frameMode', locked ? 'free' : 'locked')}>{locked ? 'Фиксация: разделители' : 'Включить фиксацию'}</button></div>
        <div className="page-strip">{pages.map((page, index) => <button key={page.id} type="button" className={`page-chip ${page.id === album.currentPageId ? 'active-page-chip' : ''}`} onClick={() => { setAlbum((current) => ({ ...current, currentPageId: page.id })); setSelectedFrameId(null); }}><b>{index + 1}</b><span>{page.frames.filter((frame) => frame.photo).length}/{page.frames.length}</span><small>{index % 2 === 0 ? 'левая' : 'правая'}</small></button>)}</div>
      </section>

      <section className="workspace three-columns">
        <aside className="sidebar">
          <div className="panel-title"><div><h2>Фото</h2><p>На компьютере можно перетаскивать. На телефоне: нажми фото, потом нажми рамку.</p></div><span>{library.length}</span></div>
          <label className="upload-box"><strong>Загрузить фото</strong><small>Можно сразу несколько</small><input type="file" accept="image/*" multiple onChange={uploadPhotos} /></label>
          <button className="button full" onClick={() => { setLibrary([]); setSelectedPhotoId(null); show('Список фото очищен'); }} disabled={library.length === 0}>Очистить список фото</button>
          {selectedPhoto && <div className="mobile-pick-hint">Выбрано фото. Теперь нажми рамку на странице.</div>}
          {library.length === 0 ? <div className="empty-state"><p>Пока фото нет. Нажми “Загрузить фото”.</p></div> : <div className="photo-grid">{library.map((photo) => <button key={photo.id} type="button" className={`photo-card ${photo.id === selectedPhotoId ? 'selected-photo-card' : ''}`} draggable onClick={() => { setSelectedPhotoId(photo.id); show('Фото выбрано'); }} onDragStart={(event) => { event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData('photo-id', photo.id); }}><img src={photo.src} alt={photo.name} draggable="false" /><span>{photo.name}</span></button>)}</div>}
        </aside>

        <section className={`canvas-area ${isSpread ? 'album-mode' : ''}`}>
          <div className="canvas-toolbar">
            <div>
              <strong>{isSpread ? `Разворот · страницы ${spreadStart + 1}–${Math.min(spreadStart + 2, pages.length)}` : `Страница ${currentPageIndex + 1}`} · {canvas.width}×{canvas.height}px</strong>
              <span>{locked ? 'Фиксация: двигай зелёные разделители между окнами. Зазор остаётся постоянным, окна не выходят за страницу.' : 'Свободные рамки: пустые окна можно двигать и растягивать, фото внутри — кадрировать.'}</span>
              <em>PNG страницы сохраняет одну страницу. PNG разворота склеивает две страницы в один файл без зазора.</em>
            </div>
            <button className="small-button" onClick={() => rebuildCurrent(settings)}>Перестроить рамки</button>
            <button className="small-button" onClick={() => { updatePageFrames(album.currentPageId, (frames) => frames.map((frame) => ({ ...frame, photo: null }))); setSelectedFrameId(null); }}>Очистить фото</button>
          </div>

          <div className={`stage-frame ${isSpread ? 'album-preview' : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={dropPhoto}>
            <Stage ref={stageRef} width={stageWidth} height={canvas.height} onMouseDown={(event) => { if (event.target === event.target.getStage() || event.target.name() === 'background') setSelectedFrameId(null); }}>
              <Layer>
                {renderEntries}
                {isSpread && settings.showGuides && <Line points={[canvas.width + SPREAD_GAP / 2, 0, canvas.width + SPREAD_GAP / 2, canvas.height]} stroke={locked ? '#2f7d52' : '#c27b4f'} strokeWidth={3} dash={[24, 18]} opacity={0.55} listening={false} />}
              </Layer>
            </Stage>
          </div>
        </section>

        <aside className="inspector">
          <div className="panel-title compact"><div><h2>Настройки окна</h2><p>{selectedFrame ? (locked ? 'В фиксации двигай зелёные разделители между окнами.' : 'Растягивай рамку за углы. Фото внутри двигай мышкой.') : 'Выбери рамку на холсте'}</p></div></div>
          <div className="inspector-block">
            <h3>Цвет и рамка</h3>
            <label className="field color-field"><span>Цвет фона / рамки</span><input type="color" value={settings.borderColor} onChange={(event) => updateSetting('borderColor', event.target.value)} /></label>
            <label className="field"><span>Обводка внутри окна</span><input type="number" min="0" max="80" value={settings.borderWidth} onChange={(event) => updateSetting('borderWidth', clamp(event.target.value, 0, 80))} /></label>
          </div>
          {selectedFrame ? <>
            <div className="inspector-block"><h3>Положение рамки</h3><div className="geometry-grid"><label className="field"><span>X</span><input type="number" value={selectedFrame.x} onChange={(event) => changeFrame(album.currentPageId, selectedFrame.id, { x: event.target.value })} /></label><label className="field"><span>Y</span><input type="number" value={selectedFrame.y} onChange={(event) => changeFrame(album.currentPageId, selectedFrame.id, { y: event.target.value })} /></label><label className="field"><span>Ширина</span><input type="number" value={selectedFrame.width} onChange={(event) => changeFrame(album.currentPageId, selectedFrame.id, { width: event.target.value })} /></label><label className="field"><span>Высота</span><input type="number" value={selectedFrame.height} onChange={(event) => changeFrame(album.currentPageId, selectedFrame.id, { height: event.target.value })} /></label></div><p className="hint">Режим: {locked ? 'фиксация через разделители, без прыжков трансформера' : selectedFrame.photo ? 'фото внутри окна двигается, рамка с фото двигается цифрами' : 'пустую рамку можно двигать мышкой'}.</p></div>
            <div className="inspector-block"><h3>Фото внутри окна</h3>{selectedFrame.photo ? <><p className="photo-name">{selectedFrame.photo.name}</p><label className="range-row"><span>Масштаб</span><input type="range" min="1" max="3" step="0.01" value={selectedFrame.photo.zoom} onChange={(event) => updatePhoto(album.currentPageId, selectedFrame.id, { zoom: Number(event.target.value) })} /><b>{selectedFrame.photo.zoom.toFixed(2)}</b></label><button className="button full" onClick={() => updatePhoto(album.currentPageId, selectedFrame.id, { zoom: 1, offsetX: 0, offsetY: 0 })}>Центрировать фото</button><button className="button full danger-button" onClick={() => updatePageFrames(album.currentPageId, (frames) => frames.map((frame) => frame.id === selectedFrame.id ? { ...frame, photo: null } : frame))}>Убрать фото из окна</button></> : <p className="hint">Нажми фото слева, потом нажми эту рамку.</p>}</div>
          </> : <div className="empty-state small-empty"><p>Нажми на любое окно коллажа, чтобы настроить его.</p></div>}
        </aside>
      </section>

      <div className="export-stage-holder" aria-hidden="true">
        <Stage ref={printPageRef} width={canvas.width} height={canvas.height}><Layer><PageLayer page={currentPage} pageIndex={currentPageIndex} x={0} canvas={canvas} settings={settings} activePageId={null} selectedFrameId={null} printMode onFrameSelect={() => {}} onPhotoMove={() => {}} onFrameChange={() => {}} onVerticalMove={() => {}} onHorizontalMove={() => {}} onActivatePage={() => {}} /></Layer></Stage>
        <Stage ref={printSpreadRef} width={canvas.width * 2} height={canvas.height}><Layer><PageLayer page={pages[spreadStart]} pageIndex={spreadStart} x={0} canvas={canvas} settings={settings} activePageId={null} selectedFrameId={null} printMode onFrameSelect={() => {}} onPhotoMove={() => {}} onFrameChange={() => {}} onVerticalMove={() => {}} onHorizontalMove={() => {}} onActivatePage={() => {}} /><PageLayer page={pages[spreadStart + 1]} pageIndex={spreadStart + 1} x={canvas.width} canvas={canvas} settings={settings} activePageId={null} selectedFrameId={null} printMode onFrameSelect={() => {}} onPhotoMove={() => {}} onFrameChange={() => {}} onVerticalMove={() => {}} onHorizontalMove={() => {}} onActivatePage={() => {}} /></Layer></Stage>
      </div>
    </main>
  );
}
