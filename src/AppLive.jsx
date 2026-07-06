import { useEffect, useMemo, useRef, useState } from 'react';
import { Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva';
import {
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

const STORAGE_KEY = 'collage-creator-album-live-v11-preserve-mode-layout';
const LEGACY_KEYS = [
  'collage-creator-album-live-v10-layer-move-photo',
  'collage-creator-album-live-v9-photo-usage-highlight',
  'collage-creator-album-live-v8-delete-frame',
  'collage-creator-album-live-v7-frame-drag-bounds',
  'collage-creator-album-live-v6-page-frame-count',
  'collage-creator-album-live-v5-sharp-preview',
  'collage-creator-album-live-v4-grid-layout',
  'collage-creator-album-live-v3',
  'collage-creator-album-live-v2',
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

const SPREAD_GAP = 90;
const EXPORT_RATIO = 2;
const HANDLE = 28;
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

const PRESETS = [
  { id: 'a5-portrait', label: 'A5 вертикальный', width: 1480, height: 2100 },
  { id: 'a5-landscape', label: 'A5 горизонтальный', width: 2100, height: 1480 },
  { id: 'a4-portrait', label: 'A4 вертикальный', width: 2100, height: 2970 },
  { id: 'square', label: 'Квадрат', width: 2000, height: 2000 },
  { id: 'draft', label: 'Черновик', width: 1000, height: 700 },
  { id: 'custom', label: 'Свой размер', width: 1480, height: 2100 },
];

const imageCache = new Map();

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
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

function scaleForPreview(width, height, isSpread) {
  const maxWidth = isSpread ? 980 : 760;
  const maxHeight = 620;
  return Math.min(1, maxWidth / width, maxHeight / height);
}

function countFramesInLayout(layout) {
  if (!layout?.rows) return 0;
  return layout.rows.reduce((sum, row) => sum + (Array.isArray(row.columns) ? row.columns.length : 0), 0);
}

function resolvePageFrameCount(page, fallbackSettings = DEFAULT_SETTINGS) {
  const saved = Number(page?.frameCount);
  if (Number.isFinite(saved) && saved >= 1) return clamp(saved, 1, 9);
  const fromLayout = countFramesInLayout(page?.layout);
  if (fromLayout) return clamp(fromLayout, 1, 9);
  const fromFrames = Array.isArray(page?.frames) ? page.frames.length : 0;
  if (fromFrames) return clamp(fromFrames, 1, 9);
  return clamp(Number(fallbackSettings.frameCount) || DEFAULT_SETTINGS.frameCount, 1, 9);
}

function settingsForPage(settings, page, explicitFrameCount) {
  return {
    ...settings,
    frameCount: explicitFrameCount ?? resolvePageFrameCount(page, settings),
  };
}

function createPage(canvas, settings, number, previousFrames = []) {
  const frameCount = clamp(Number(settings.frameCount) || DEFAULT_SETTINGS.frameCount, 1, 9);
  const built = buildGridLayout(canvas, { ...settings, frameCount }, previousFrames);
  return { id: makeId(), title: `Страница ${number}`, frameCount, layout: built.layout, frames: built.frames };
}

function initialAlbum() {
  const first = createPage(DEFAULT_CANVAS, DEFAULT_SETTINGS, 1);
  const second = createPage(DEFAULT_CANVAS, DEFAULT_SETTINGS, 2);
  return { pages: [first, second], currentPageId: first.id };
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
      onMouseDown={(event) => { event.cancelBubble = true; onSelect(); }}
      onTap={(event) => { event.cancelBubble = true; onSelect(); }}
      onDragStart={(event) => { event.cancelBubble = true; }}
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

function CollageFrame({ frame, selected, locked, borderWidth, borderColor, printMode, canvas, pageOffsetX, moveFrameWithPhoto, onSelect, onPhotoMove, onFrameChange, onFrameDragFinish }) {
  const [image, setImage] = useState(null);
  const groupRef = useRef(null);
  const frameRectRef = useRef(null);
  const transformerRef = useRef(null);
  const rect = coverRect(image, frame, frame.photo);
  const canDragFrame = !printMode && selected && !locked;

  useEffect(() => {
    let active = true;
    if (!frame.photo?.src) {
      setImage(null);
      return () => { active = false; };
    }
    loadImage(frame.photo.src)
      .then((loaded) => { if (active) setImage(loaded); })
      .catch(() => { if (active) setImage(null); });
    return () => { active = false; };
  }, [frame.photo?.src]);

  useEffect(() => {
    const transformer = transformerRef.current;
    const frameRect = frameRectRef.current;
    if (!transformer || !frameRect) return;
    transformer.nodes(selected && !printMode && !locked ? [frameRect] : []);
    transformer.getLayer()?.batchDraw();
  }, [selected, printMode, locked, frame.x, frame.y, frame.width, frame.height]);

  function clampFrameNode(node) {
    node.x(clamp(node.x(), 0, Math.max(0, canvas.width - frame.width)));
    node.y(clamp(node.y(), 0, Math.max(0, canvas.height - frame.height)));
  }

  function commitFrameDrag(event) {
    if (printMode || !selected || locked) return;
    const node = event.target;
    clampFrameNode(node);
    onFrameChange(frame.id, { x: node.x(), y: node.y() });
    onFrameDragFinish?.();
  }

  function commitTransform() {
    if (printMode || !selected || locked || !frameRectRef.current) return;
    const node = frameRectRef.current;
    const patch = {
      x: frame.x + node.x(),
      y: frame.y + node.y(),
      width: frame.width * node.scaleX(),
      height: frame.height * node.scaleY(),
    };
    node.x(0);
    node.y(0);
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
        onDragMove={(event) => {
          if (!canDragFrame) return;
          clampFrameNode(event.target);
        }}
        onDragEnd={commitFrameDrag}
      >
        <Group clipX={0} clipY={0} clipWidth={frame.width} clipHeight={frame.height}>
          <Rect
            ref={frameRectRef}
            x={0}
            y={0}
            width={frame.width}
            height={frame.height}
            fill="#fbf7f2"
            stroke={selected && !printMode ? (locked ? '#2f7d52' : '#c27b4f') : borderColor}
            strokeWidth={selected && !printMode ? Math.max(5, borderWidth) : borderWidth}
            strokeScaleEnabled={false}
            onTransformEnd={commitTransform}
          />
          <PhotoImage frame={frame} selected={selected} image={image} rect={rect} printMode={printMode} onSelect={onSelect} onPhotoMove={onPhotoMove} />
          {moveFrameWithPhoto && !printMode && selected && !locked && (
            <Rect x={0} y={0} width={frame.width} height={frame.height} fill="rgba(47, 125, 82, 0.01)" stroke="#2f7d52" strokeWidth={6} strokeScaleEnabled={false} dash={[18, 12]} />
          )}
          {!frame.photo && !printMode && (
            <Rect x={14} y={14} width={Math.max(0, frame.width - 28)} height={Math.max(0, frame.height - 28)} stroke="#d8c7b9" strokeWidth={2} strokeScaleEnabled={false} dash={[14, 10]} cornerRadius={12} listening={false} />
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
          anchorSize={26}
          anchorCornerRadius={6}
          borderStroke="#c27b4f"
          borderStrokeWidth={3}
          anchorStroke="#c27b4f"
          anchorFill="#fff7ef"
          boundBoxFunc={(oldBox, newBox) => {
            const pageLeft = pageOffsetX;
            const pageRight = pageOffsetX + canvas.width;
            if (newBox.width < MIN_FRAME || newBox.height < MIN_FRAME) return oldBox;
            if (newBox.x < pageLeft || newBox.y < 0) return oldBox;
            if (newBox.x + newBox.width > pageRight || newBox.y + newBox.height > canvas.height) return oldBox;
            return newBox;
          }}
        />
      )}
    </>
  );
}

function GridHandles({ layout, onColumnResize, onRowResize, onActivate }) {
  if (!layout) return null;
  return (
    <>
      {getColumnHandles(layout).map((handle) => (
        <Rect
          key={handle.key}
          x={handle.x - HANDLE / 2}
          y={handle.y}
          width={HANDLE}
          height={handle.height}
          fill="#2f7d52"
          opacity={0.18}
          draggable
          onMouseDown={(event) => { event.cancelBubble = true; onActivate(); }}
          onTap={(event) => { event.cancelBubble = true; onActivate(); }}
          onDragMove={(event) => { event.cancelBubble = true; event.target.y(handle.y); onColumnResize(handle.rowIndex, handle.dividerIndex, event.target.x() + HANDLE / 2); }}
          onDragEnd={(event) => { event.cancelBubble = true; event.target.y(handle.y); onColumnResize(handle.rowIndex, handle.dividerIndex, event.target.x() + HANDLE / 2); }}
        />
      ))}
      {getRowHandles(layout).map((handle) => (
        <Rect
          key={handle.key}
          x={handle.x}
          y={handle.y - HANDLE / 2}
          width={handle.width}
          height={HANDLE}
          fill="#2f7d52"
          opacity={0.18}
          draggable
          onMouseDown={(event) => { event.cancelBubble = true; onActivate(); }}
          onTap={(event) => { event.cancelBubble = true; onActivate(); }}
          onDragMove={(event) => { event.cancelBubble = true; event.target.x(handle.x); onRowResize(handle.rowIndex, event.target.y() + HANDLE / 2); }}
          onDragEnd={(event) => { event.cancelBubble = true; event.target.x(handle.x); onRowResize(handle.rowIndex, event.target.y() + HANDLE / 2); }}
        />
      ))}
    </>
  );
}

function PageLayer({ page, pageIndex, x, canvas, settings, activePageId, selectedFrameId, moveFrameWithPhotoId, printMode = false, onFrameSelect, onPhotoMove, onFrameChange, onFrameDragFinish, onColumnResize, onRowResize, onActivatePage }) {
  const locked = settings.frameMode === 'locked';
  const safe = Math.min(settings.padding, Math.floor(canvas.width / 3), Math.floor(canvas.height / 3));
  if (!page) {
    return <Group x={x} y={0}><Rect name="background" x={0} y={0} width={canvas.width} height={canvas.height} fill={settings.borderColor} /></Group>;
  }
  const orderedFrames = [...page.frames].sort((a, b) => (Number(a.zIndex) || 0) - (Number(b.zIndex) || 0));
  return (
    <Group x={x} y={0}>
      <Rect name="background" x={0} y={0} width={canvas.width} height={canvas.height} fill={settings.borderColor} />
      {!printMode && settings.showGuides && (
        <>
          <Rect x={safe} y={safe} width={Math.max(0, canvas.width - safe * 2)} height={Math.max(0, canvas.height - safe * 2)} stroke={locked ? '#2f7d52' : '#c27b4f'} strokeWidth={2} strokeScaleEnabled={false} dash={[18, 14]} listening={false} />
          <Text x={safe + 16} y={safe + 16} text={locked ? 'сетка: двигай разделители' : 'поля / безопасная зона'} fontSize={28} fill={locked ? '#2f7d52' : '#c27b4f'} opacity={0.62} listening={false} />
        </>
      )}
      {!printMode && <Text x={28} y={24} text={`Стр. ${pageIndex + 1}`} fontSize={34} fill={page.id === activePageId ? (locked ? '#2f7d52' : '#c27b4f') : '#b49a87'} fontStyle="bold" listening={false} />}
      {orderedFrames.map((frame) => (
        <CollageFrame
          key={frame.id}
          frame={frame}
          selected={!printMode && page.id === activePageId && frame.id === selectedFrameId}
          locked={locked}
          borderWidth={settings.borderWidth}
          borderColor={settings.borderColor}
          printMode={printMode}
          canvas={canvas}
          pageOffsetX={x}
          moveFrameWithPhoto={!printMode && frame.id === moveFrameWithPhotoId}
          onSelect={() => !printMode && onFrameSelect(page.id, frame.id)}
          onPhotoMove={(frameId, patch) => !printMode && onPhotoMove(page.id, frameId, patch)}
          onFrameChange={(frameId, patch) => !printMode && onFrameChange(page.id, frameId, patch)}
          onFrameDragFinish={() => !printMode && onFrameDragFinish?.(frame.id)}
        />
      ))}
      {!printMode && locked && (
        <GridHandles
          layout={page.layout}
          onActivate={() => onActivatePage(page.id)}
          onColumnResize={(rowIndex, dividerIndex, centerX) => onColumnResize(page.id, rowIndex, dividerIndex, centerX)}
          onRowResize={(rowIndex, centerY) => onRowResize(page.id, rowIndex, centerY)}
        />
      )}
    </Group>
  );
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
  const [moveFrameWithPhotoId, setMoveFrameWithPhotoId] = useState(null);
  const [viewMode, setViewMode] = useState('spread');
  const [notice, setNotice] = useState('');

  const pages = album.pages;
  const currentPageIndex = Math.max(0, pages.findIndex((page) => page.id === album.currentPageId));
  const currentPage = pages[currentPageIndex] ?? pages[0];
  const currentPageFrameCount = resolvePageFrameCount(currentPage, settings);
  const spreadStart = currentPageIndex % 2 === 0 ? currentPageIndex : currentPageIndex - 1;
  const isSpread = viewMode === 'spread';
  const locked = settings.frameMode === 'locked';
  const stageRealWidth = isSpread ? canvas.width * 2 + SPREAD_GAP : canvas.width;
  const previewScale = scaleForPreview(stageRealWidth, canvas.height, isSpread);
  const stageDisplayWidth = stageRealWidth * previewScale;
  const stageDisplayHeight = canvas.height * previewScale;
  const entries = isSpread
    ? [
        { page: pages[spreadStart], pageIndex: spreadStart, x: 0 },
        { page: pages[spreadStart + 1], pageIndex: spreadStart + 1, x: canvas.width + SPREAD_GAP },
      ]
    : [{ page: currentPage, pageIndex: currentPageIndex, x: 0 }];

  const selectedFrame = useMemo(() => currentPage?.frames.find((frame) => frame.id === selectedFrameId) ?? null, [currentPage, selectedFrameId]);
  const selectedPhoto = useMemo(() => library.find((photo) => photo.id === selectedPhotoId) ?? null, [library, selectedPhotoId]);
  const usedPhotoIds = useMemo(() => {
    const used = new Set();
    pages.forEach((page) => {
      page.frames?.forEach((frame) => {
        if (frame.photo?.id) used.add(frame.photo.id);
      });
    });
    return used;
  }, [pages]);

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

  function rebuildPage(pageId, nextCanvas = canvas, nextSettings = settings, explicitFrameCount) {
    setAlbum((current) => ({
      ...current,
      pages: current.pages.map((page) => {
        if (page.id !== pageId) return page;
        const frameCount = explicitFrameCount ?? resolvePageFrameCount(page, nextSettings);
        const pageSettings = settingsForPage(nextSettings, page, frameCount);
        const built = buildGridLayout(nextCanvas, pageSettings, page.frames);
        return { ...page, frameCount, layout: built.layout, frames: built.frames };
      }),
    }));
    setSelectedFrameId(null);
    setMoveFrameWithPhotoId(null);
  }

  function rebuildAll(nextCanvas = canvas, nextSettings = settings) {
    setAlbum((current) => ({
      ...current,
      pages: current.pages.map((page) => {
        const frameCount = resolvePageFrameCount(page, nextSettings);
        const pageSettings = settingsForPage(nextSettings, page, frameCount);
        const built = buildGridLayout(nextCanvas, pageSettings, page.frames);
        return { ...page, frameCount, layout: built.layout, frames: built.frames };
      }),
    }));
    setSelectedFrameId(null);
    setMoveFrameWithPhotoId(null);
  }

  function updateCurrentPageFrameCount(value) {
    const frameCount = clamp(Number(value), 1, 9);
    const nextSettings = { ...settings, frameCount };
    setSettings(nextSettings);
    rebuildPage(album.currentPageId, canvas, nextSettings, frameCount);
    show(`На странице ${currentPageIndex + 1}: ${frameCount} фото-окон`);
  }

  function updateSetting(key, value) {
    if (key === 'frameCount') {
      updateCurrentPageFrameCount(value);
      return;
    }
    const next = { ...settings, [key]: value };
    setSettings(next);

    if (key === 'showGuides' || key === 'borderColor' || key === 'borderWidth') return;

    if (key === 'frameMode') {
      setMoveFrameWithPhotoId(null);
      show(value === 'locked' ? 'Сетка включена. Раскладка сохранена.' : 'Свободный режим включён. Раскладка сохранена.');
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

  function updateLayoutPage(pageId, layoutUpdater) {
    setAlbum((current) => ({
      ...current,
      currentPageId: pageId,
      pages: current.pages.map((page) => {
        if (page.id !== pageId) return page;
        const oldLayout = ensureLayout(page, canvas, settingsForPage(settings, page));
        const nextLayout = layoutUpdater(oldLayout);
        return { ...page, layout: nextLayout, frames: framesFromLayout(nextLayout, page.frames) };
      }),
    }));
  }

  function resizeGridColumn(pageId, rowIndex, dividerIndex, centerX) {
    updateLayoutPage(pageId, (layout) => resizeColumn(layout, rowIndex, dividerIndex, centerX));
  }

  function resizeGridRow(pageId, rowIndex, centerY) {
    updateLayoutPage(pageId, (layout) => resizeRow(layout, rowIndex, centerY));
  }

  function uploadPhotos(event) {
    const files = Array.from(event.target.files ?? []);
    files.forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = () => setLibrary((current) => [...current, { id: makeId(), name: file.name, src: reader.result }]);
      reader.readAsDataURL(file);
    });
    event.target.value = '';
    if (files.length) show('Фото загружены');
  }

  function putPhoto(pageId, frameId, photo) {
    updatePageFrames(pageId, (frames) => frames.map((frame) => (frame.id === frameId ? { ...frame, photo: { id: photo.id, name: photo.name, src: photo.src, zoom: 1, offsetX: 0, offsetY: 0 } } : frame)));
    setAlbum((current) => ({ ...current, currentPageId: pageId }));
    setSelectedFrameId(frameId);
    setMoveFrameWithPhotoId(null);
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
    setMoveFrameWithPhotoId((current) => (current && current !== frameId ? null : current));
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
    setMoveFrameWithPhotoId(null);
  }



  function duplicatePage() {
    if (!currentPage) return;
    const pageSettings = settingsForPage(settings, currentPage, currentPageFrameCount);
    const page = createPage(canvas, pageSettings, pages.length + 1, currentPage.frames);
    setAlbum((current) => {
      const index = current.pages.findIndex((item) => item.id === current.currentPageId);
      const next = [...current.pages];
      next.splice(index + 1, 0, page);
      return { pages: next, currentPageId: page.id };
    });
    setMoveFrameWithPhotoId(null);
  }



  function deletePage() {
    if (pages.length <= 1) return show('Нельзя удалить единственную страницу');
    setAlbum((current) => {
      const index = current.pages.findIndex((page) => page.id === current.currentPageId);
      const next = current.pages.filter((page) => page.id !== current.currentPageId);
      return { pages: next, currentPageId: next[Math.min(index, next.length - 1)].id };
    });
    setMoveFrameWithPhotoId(null);
  }



  function deleteSelectedFrame() {
    if (!selectedFrame || !currentPage) return;
    const frameCount = resolvePageFrameCount(currentPage, settings);
    if (frameCount <= 1) return show('Нельзя удалить последнее окно на странице');
    const nextFrameCount = frameCount - 1;
    const keptFrames = currentPage.frames.filter((frame) => frame.id !== selectedFrame.id);
    const nextSettings = { ...settings, frameCount: nextFrameCount };
    setSettings(nextSettings);
    setAlbum((current) => ({
      ...current,
      pages: current.pages.map((page) => {
        if (page.id !== current.currentPageId) return page;
        const pageSettings = settingsForPage(nextSettings, page, nextFrameCount);
        const built = buildGridLayout(canvas, pageSettings, keptFrames);
        return { ...page, frameCount: nextFrameCount, layout: built.layout, frames: built.frames };
      }),
    }));
    setSelectedFrameId(null);
    setMoveFrameWithPhotoId(null);
    show(`Окно удалено. На странице ${currentPageIndex + 1}: ${nextFrameCount} фото-окон`);
  }

  function bringSelectedFrameToFront() {
    if (!selectedFrame || locked) return;
    const maxZ = Math.max(0, ...(currentPage?.frames ?? []).map((frame) => Number(frame.zIndex) || 0));
    updatePageFrames(album.currentPageId, (frames) => frames.map((frame) => (frame.id === selectedFrame.id ? { ...frame, zIndex: maxZ + 1 } : frame)));
    show('Окно поднято поверх остальных');
  }

  function enableMoveFrameWithPhoto() {
    if (!selectedFrame || locked) return;
    if (!selectedFrame.photo) {
      show('В этом окне нет фото. Рамку можно двигать обычным способом.');
      return;
    }
    setMoveFrameWithPhotoId(selectedFrame.id);
    show('Теперь перетащи рамку: фото поедет вместе с ней.');
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
    setMoveFrameWithPhotoId(null);
  }



  function goSpread(direction) {
    const next = direction === 'next' ? Math.min(pages.length - 1, spreadStart + 2) : Math.max(0, spreadStart - 2);
    setAlbum((current) => ({ ...current, currentPageId: pages[next]?.id ?? pages[0].id }));
    setMoveFrameWithPhotoId(null);
  }



  function project() {
    return { version: 'live-11-preserve-mode-layout', canvas, settings, library, pages, currentPageId: album.currentPageId, viewMode, savedAt: new Date().toISOString() };
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(project()));
      show('Альбом сохранён');
    } catch (error) {
      console.error(error);
      show('Не удалось сохранить: проект слишком большой. Скачай JSON или очисти лишние фото.');
    }
  }

  function normalizePages(data, nextCanvas, nextSettings) {
    if (Array.isArray(data.pages) && data.pages.length) {
      return data.pages.map((page, index) => {
        const frames = Array.isArray(page.frames) ? page.frames.map((frame) => cleanFrame(frame, nextCanvas)) : [];
        const existingLayoutCount = countFramesInLayout(page.layout);
        const frameCount = clamp(Number(page.frameCount) || existingLayoutCount || frames.length || nextSettings.frameCount, 1, 9);
        const trustLayout = page.layout?.type === 'grid' && existingLayoutCount === frameCount;
        const pageSettings = { ...nextSettings, frameCount };
        const layout = trustLayout ? page.layout : buildGridLayout(nextCanvas, pageSettings, frames).layout;
        return { id: page.id ?? makeId(), title: page.title ?? `Страница ${index + 1}`, frameCount, layout, frames: framesFromLayout(layout, frames) };
      });
    }
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
      const nextPages = normalizePages(data, nextCanvas, nextSettings);
      setCanvas(nextCanvas);
      setSettings(nextSettings);
      setLibrary(Array.isArray(data.library) ? data.library : []);
      setAlbum({ pages: nextPages, currentPageId: nextPages.some((page) => page.id === data.currentPageId) ? data.currentPageId : nextPages[0].id });
      setViewMode(data.viewMode === 'single' ? 'single' : 'spread');
      setSelectedFrameId(null);
      setSelectedPhotoId(null);
      setMoveFrameWithPhotoId(null);
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
        const nextPages = normalizePages(data, nextCanvas, nextSettings);
        setCanvas(nextCanvas);
        setSettings(nextSettings);
        setLibrary(Array.isArray(data.library) ? data.library : []);
        setAlbum({ pages: nextPages, currentPageId: nextPages[0].id });
        setViewMode(data.viewMode === 'single' ? 'single' : 'spread');
        setSelectedFrameId(null);
        setSelectedPhotoId(null);
        setMoveFrameWithPhotoId(null);
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
    setMoveFrameWithPhotoId(null);
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
      moveFrameWithPhotoId={moveFrameWithPhotoId}
      onFrameSelect={selectFrame}
      onPhotoMove={updatePhoto}
      onFrameChange={changeFrame}
      onFrameDragFinish={() => setMoveFrameWithPhotoId(null)}
      onColumnResize={resizeGridColumn}
      onRowResize={resizeGridRow}
      onActivatePage={(pageId) => setAlbum((current) => ({ ...current, currentPageId: pageId }))}
    />
  ));

  const commonPageLayerProps = {
    canvas,
    settings,
    activePageId: null,
    selectedFrameId: null,
    moveFrameWithPhotoId: null,
    printMode: true,
    onFrameSelect: () => {},
    onPhotoMove: () => {},
    onFrameChange: () => {},
    onFrameDragFinish: () => {},
    onColumnResize: () => {},
    onRowResize: () => {},
    onActivatePage: () => {},
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div><p className="eyebrow">Редактор альбома</p><h1>Collage Creator</h1></div>
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
        <label className="field small-field"><span>Фото-окон этой страницы</span><select value={currentPageFrameCount} onChange={(event) => updateSetting('frameCount', Number(event.target.value))}>{[1, 2, 3, 4, 5, 6, 7, 8, 9].map((count) => <option key={count} value={count}>{count}</option>)}</select></label>
        <label className="field small-field"><span>Зазор</span><input type="number" value={settings.gap} onChange={(event) => updateSetting('gap', clamp(event.target.value, 0, 200))} /></label>
        <label className="field small-field"><span>Поля</span><input type="number" value={settings.padding} onChange={(event) => updateSetting('padding', clamp(event.target.value, 0, 300))} /></label>
      </section>

      <section className="album-bar">
        <div className="album-head"><strong>Страницы альбома</strong><span>{isSpread ? `Разворот ${spreadStart + 1}–${Math.min(spreadStart + 2, pages.length)}` : `Страница ${currentPageIndex + 1} из ${pages.length}`}</span></div>
        <div className="view-switch"><button className={`small-button ${!isSpread ? 'active-mode' : ''}`} onClick={() => setViewMode('single')}>Страница</button><button className={`small-button ${isSpread ? 'active-mode' : ''}`} onClick={() => setViewMode('spread')}>Разворот / 2 страницы</button></div>
        <div className="album-actions"><button className="small-button" onClick={addPage}>+ Страница</button><button className="small-button" onClick={duplicatePage}>Копия</button><button className="small-button danger" onClick={deletePage}>Удалить</button></div>
        <div className="spread-actions"><button className="small-button" onClick={() => goSpread('prev')} disabled={spreadStart === 0}>← разворот</button><button className="small-button" onClick={() => goSpread('next')} disabled={spreadStart + 2 >= pages.length}>разворот →</button><button className={`small-button ${settings.showGuides ? 'active-mode' : ''}`} onClick={() => updateSetting('showGuides', !settings.showGuides)}>{settings.showGuides ? 'Скрыть направляющие' : 'Показать направляющие'}</button><button className={`small-button ${locked ? 'active-mode' : ''}`} onClick={() => updateSetting('frameMode', locked ? 'free' : 'locked')}>{locked ? 'Сетка: разделители' : 'Включить сетку'}</button></div>
        <div className="page-strip">{pages.map((page, index) => <button key={page.id} type="button" className={`page-chip ${page.id === album.currentPageId ? 'active-page-chip' : ''}`} onClick={() => { setAlbum((current) => ({ ...current, currentPageId: page.id })); setSelectedFrameId(null); setMoveFrameWithPhotoId(null); }}><b>{index + 1}</b><span>{page.frames.filter((frame) => frame.photo).length}/{resolvePageFrameCount(page, settings)}</span><small>{index % 2 === 0 ? 'левая' : 'правая'}</small></button>)}</div>
      </section>

      <section className="workspace three-columns">
        <aside className="sidebar">
          <div className="panel-title"><div><h2>Фото</h2><p>На компьютере можно перетаскивать. На телефоне: нажми фото, потом нажми рамку.</p></div><span>{library.length}</span></div>
          <label className="upload-box"><strong>Загрузить фото</strong><small>Можно сразу несколько</small><input type="file" accept="image/*" multiple onChange={uploadPhotos} /></label>
          <button className="button full" onClick={() => { setLibrary([]); setSelectedPhotoId(null); show('Список фото очищен'); }} disabled={library.length === 0}>Очистить список фото</button>
          {selectedPhoto && <div className="mobile-pick-hint">Выбрано фото. Теперь нажми рамку на странице.</div>}
          {library.length === 0 ? <div className="empty-state"><p>Пока фото нет. Нажми “Загрузить фото”.</p></div> : <div className="photo-grid">{library.map((photo) => {
            const isUsed = usedPhotoIds.has(photo.id);
            return (
              <button
                key={photo.id}
                type="button"
                className={`photo-card ${photo.id === selectedPhotoId ? 'selected-photo-card' : ''} ${isUsed ? 'used-photo-card' : ''}`}
                draggable
                onClick={() => { setSelectedPhotoId(photo.id); show(isUsed ? 'Фото уже есть в альбоме. Можно вставить ещё раз.' : 'Фото выбрано'); }}
                onDragStart={(event) => { event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData('photo-id', photo.id); }}
              >
                <img src={photo.src} alt={photo.name} draggable="false" />
                {isUsed && <small className="photo-used-badge">В альбоме</small>}
                <span>{photo.name}</span>
              </button>
            );
          })}</div>}
        </aside>

        <section className={`canvas-area ${isSpread ? 'album-mode' : ''}`}>
          <div className="canvas-toolbar"><div><strong>{isSpread ? `Разворот · страницы ${spreadStart + 1}–${Math.min(spreadStart + 2, pages.length)}` : `Страница ${currentPageIndex + 1}`} · {canvas.width}×{canvas.height}px</strong><span>{locked ? 'Сетка: двигай зелёные разделители. Зазор постоянный, окна не выходят за страницу.' : 'Свободный режим: окна можно двигать внутри страницы и менять размер за маркеры. Фото внутри можно двигать.'}</span><em>PNG страницы сохраняет одну страницу. PNG разворота склеивает две страницы в один файл без зазора.</em></div><button className="small-button" onClick={() => rebuildPage(album.currentPageId, canvas, settings)}>Перестроить рамки</button><button className="small-button" onClick={() => { updatePageFrames(album.currentPageId, (frames) => frames.map((frame) => ({ ...frame, photo: null }))); setSelectedFrameId(null); setMoveFrameWithPhotoId(null); }}>Очистить фото</button></div>

          <div className={`stage-frame ${isSpread ? 'album-preview' : ''}`} style={{ width: stageDisplayWidth, height: stageDisplayHeight }} onDragOver={(event) => event.preventDefault()} onDrop={dropPhoto}>
            <div className="stage-scale-shell" style={{ width: stageRealWidth, height: canvas.height, transform: `scale(${previewScale})` }}>
              <Stage ref={stageRef} width={stageRealWidth} height={canvas.height} onMouseDown={(event) => { if (event.target === event.target.getStage() || event.target.name() === 'background') { setSelectedFrameId(null); setMoveFrameWithPhotoId(null); } }}>
                <Layer>
                  {renderEntries}
                  {isSpread && settings.showGuides && <Line points={[canvas.width + SPREAD_GAP / 2, 0, canvas.width + SPREAD_GAP / 2, canvas.height]} stroke={locked ? '#2f7d52' : '#c27b4f'} strokeWidth={3} dash={[24, 18]} opacity={0.55} listening={false} />}
                </Layer>
              </Stage>
            </div>
          </div>
        </section>

        <aside className="inspector">
          <div className="panel-title compact"><div><h2>Настройки окна</h2><p>{selectedFrame ? (locked ? 'В сетке двигай зелёные разделители между окнами.' : 'Двигай рамку внутри страницы или меняй размер за маркеры. Фото внутри двигай мышкой.') : 'Выбери рамку на холсте'}</p></div></div>
          <div className="inspector-block"><h3>Цвет и рамка</h3><label className="field color-field"><span>Цвет фона / рамки</span><input type="color" value={settings.borderColor} onChange={(event) => updateSetting('borderColor', event.target.value)} /></label><label className="field"><span>Обводка внутри окна</span><input type="number" min="0" max="80" value={settings.borderWidth} onChange={(event) => updateSetting('borderWidth', clamp(event.target.value, 0, 80))} /></label></div>
          {selectedFrame ? (
            <>
              <div className="inspector-block">
                <h3>Положение рамки</h3>
                <div className="geometry-grid">
                  <label className="field"><span>X</span><input type="number" value={selectedFrame.x} onChange={(event) => changeFrame(album.currentPageId, selectedFrame.id, { x: event.target.value })} /></label>
                  <label className="field"><span>Y</span><input type="number" value={selectedFrame.y} onChange={(event) => changeFrame(album.currentPageId, selectedFrame.id, { y: event.target.value })} /></label>
                  <label className="field"><span>Ширина</span><input type="number" value={selectedFrame.width} onChange={(event) => changeFrame(album.currentPageId, selectedFrame.id, { width: event.target.value })} /></label>
                  <label className="field"><span>Высота</span><input type="number" value={selectedFrame.height} onChange={(event) => changeFrame(album.currentPageId, selectedFrame.id, { height: event.target.value })} /></label>
                </div>
                {!locked && <button className="button full" onClick={bringSelectedFrameToFront}>Поверх остальных</button>}
                {!locked && <button className={`button full ${moveFrameWithPhotoId === selectedFrame.id ? 'accent' : ''}`} onClick={enableMoveFrameWithPhoto} disabled={!selectedFrame.photo}>{moveFrameWithPhotoId === selectedFrame.id ? 'Перетащи рамку сейчас' : 'Двигать рамку с фото'}</button>}
                <button className="button full danger-button" onClick={deleteSelectedFrame} disabled={currentPageFrameCount <= 1}>Удалить окно</button>
                <p className="hint">Удаление перестроит эту страницу: соседние окна сдвинутся, фото сохранятся по порядку.</p>
                <p className="hint">Режим: {locked ? 'сетка через layout, без угадывания соседей по координатам' : selectedFrame.photo ? 'фото внутри окна двигается; для движения рамки вместе с фото нажми кнопку выше' : 'рамка двигается внутри страницы и меняет размер за маркеры'}.</p>
              </div>
              <div className="inspector-block">
                <h3>Фото внутри окна</h3>
                {selectedFrame.photo ? (
                  <>
                    <p className="photo-name">{selectedFrame.photo.name}</p>
                    <label className="range-row"><span>Масштаб</span><input type="range" min="1" max="3" step="0.01" value={selectedFrame.photo.zoom} onChange={(event) => updatePhoto(album.currentPageId, selectedFrame.id, { zoom: Number(event.target.value) })} /><b>{selectedFrame.photo.zoom.toFixed(2)}</b></label>
                    <button className="button full" onClick={() => updatePhoto(album.currentPageId, selectedFrame.id, { zoom: 1, offsetX: 0, offsetY: 0 })}>Центрировать фото</button>
                    <button className="button full danger-button" onClick={() => updatePageFrames(album.currentPageId, (frames) => frames.map((frame) => frame.id === selectedFrame.id ? { ...frame, photo: null } : frame))}>Убрать фото из окна</button>
                  </>
                ) : <p className="hint">Нажми фото слева, потом нажми эту рамку.</p>}
              </div>
            </>
          ) : <div className="empty-state small-empty"><p>Нажми на любое окно коллажа, чтобы настроить его.</p></div>}
        </aside>
      </section>

      <div className="export-stage-holder" aria-hidden="true">
        <Stage ref={printPageRef} width={canvas.width} height={canvas.height}><Layer><PageLayer page={currentPage} pageIndex={currentPageIndex} x={0} {...commonPageLayerProps} /></Layer></Stage>
        <Stage ref={printSpreadRef} width={canvas.width * 2} height={canvas.height}><Layer><PageLayer page={pages[spreadStart]} pageIndex={spreadStart} x={0} {...commonPageLayerProps} /><PageLayer page={pages[spreadStart + 1]} pageIndex={spreadStart + 1} x={canvas.width} {...commonPageLayerProps} /></Layer></Stage>
      </div>
    </main>
  );
}
