import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ellipse, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text } from 'react-konva';
import AlbumFlipPreview from './AlbumFlipPreview';
import DrawingImageLayer from './DrawingImageLayer';
import { hydratePhotoProject } from './photoAssets';
import { loadCachedImage as loadImage } from './imageCache';
import { coverPhotoRect } from './frameModel';
import { borderDashFor, normalizeFrameStyle } from './frameStyle';
import { drawingLayersForPage, textLayersForPage } from './extraLayers';
import { normalizePageNumbering, pageNumberPlacement, pageNumberValue } from './pageNumbering';

const PREVIEW_WIDTH = 520;

function useLoadedImage(src) {
  const [loaded, setLoaded] = useState({ src: '', image: null });

  useEffect(() => {
    let active = true;
    setLoaded({ src: src || '', image: null });
    if (!src) return () => { active = false; };
    loadImage(src)
      .then((image) => { if (active) setLoaded({ src, image }); })
      .catch(() => { if (active) setLoaded({ src, image: null }); });
    return () => { active = false; };
  }, [src]);

  return loaded.src === src ? loaded.image : null;
}

function roundedFramePath(context, width, height, requestedRadius) {
  const radius = Math.min(Math.max(0, Number(requestedRadius) || 0), width / 2, height / 2);
  context.beginPath();
  context.moveTo(radius, 0);
  context.lineTo(width - radius, 0);
  context.quadraticCurveTo(width, 0, width, radius);
  context.lineTo(width, height - radius);
  context.quadraticCurveTo(width, height, width - radius, height);
  context.lineTo(radius, height);
  context.quadraticCurveTo(0, height, 0, height - radius);
  context.lineTo(0, radius);
  context.quadraticCurveTo(0, 0, radius, 0);
  context.closePath();
}

function PreviewFrameBorder({ frame, style }) {
  if (style.borderStyle === 'none' || style.borderWidth <= 0) return null;
  const inset = style.borderWidth / 2;
  const width = Math.max(0, frame.width - style.borderWidth);
  const height = Math.max(0, frame.height - style.borderWidth);
  const radius = Math.max(0, style.cornerRadius - inset);
  const common = {
    x: inset,
    y: inset,
    width,
    height,
    cornerRadius: radius,
    stroke: style.borderColor,
    strokeWidth: style.borderWidth,
    strokeScaleEnabled: true,
    dash: borderDashFor(style.borderStyle, style.borderWidth),
    lineCap: style.borderStyle === 'dotted' ? 'round' : 'butt',
    listening: false,
  };
  if (style.borderStyle !== 'double') return <Rect {...common} />;

  const lineWidth = Math.max(1, style.borderWidth / 3);
  const innerInset = style.borderWidth * 1.25;
  return (
    <>
      <Rect {...common} strokeWidth={lineWidth} />
      <Rect
        {...common}
        x={innerInset}
        y={innerInset}
        width={Math.max(0, frame.width - innerInset * 2)}
        height={Math.max(0, frame.height - innerInset * 2)}
        cornerRadius={Math.max(0, style.cornerRadius - innerInset)}
        strokeWidth={lineWidth}
      />
    </>
  );
}

function PreviewFrame({ frame, settings }) {
  const source = frame?.photo?.src || '';
  const image = useLoadedImage(source);
  if (!frame?.photo || !source) return null;
  const rect = coverPhotoRect(image, frame, frame.photo);
  const style = normalizeFrameStyle(frame, settings);

  return (
    <Group
      x={Number(frame.x) || 0}
      y={Number(frame.y) || 0}
      clipFunc={(context) => roundedFramePath(context, frame.width, frame.height, style.cornerRadius)}
      listening={false}
    >
      <Rect width={frame.width} height={frame.height} fill="#fbf7f2" listening={false} />
      {image && rect && (
        <KonvaImage
          image={image}
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={rect.height}
          listening={false}
        />
      )}
      <PreviewFrameBorder frame={frame} style={style} />
    </Group>
  );
}

function previewOpacity(value) {
  return Math.max(0, Math.min(1, Number(value ?? 1)));
}

function PreviewLineDrawing({ item, pageIndex }) {
  return (
    <Line
      key={item.id ?? `${pageIndex}-line-${item.x}-${item.y}`}
      x={Number(item.x) || 0}
      y={Number(item.y) || 0}
      points={[0, 0, Math.max(1, Number(item.length) || 300), 0]}
      rotation={Number(item.angle) || 0}
      stroke={item.color || '#6f6862'}
      strokeWidth={Math.max(1, Number(item.strokeWidth) || 4)}
      opacity={previewOpacity(item.opacity)}
      lineCap="round"
      listening={false}
    />
  );
}

function PreviewShapeDrawing({ item, pageIndex }) {
  const width = Math.max(20, Number(item.width) || 320);
  const height = Math.max(20, Number(item.height) || 320);
  const fill = item.fillEnabled !== false ? (item.fillColor || '#e7d6c6') : undefined;
  const stroke = item.strokeEnabled === true ? (item.strokeColor || '#6f6862') : undefined;
  const strokeWidth = item.strokeEnabled === true ? Math.max(1, Number(item.strokeWidth) || 4) : 0;
  const common = {
    fill,
    stroke,
    strokeWidth,
    opacity: previewOpacity(item.opacity),
    listening: false,
  };

  return (
    <Group key={item.id ?? `${pageIndex}-shape-${item.x}-${item.y}`} x={Number(item.x) || 0} y={Number(item.y) || 0} listening={false}>
      {item.shapeKind === 'ellipse' ? (
        <Ellipse x={width / 2} y={height / 2} radiusX={width / 2} radiusY={height / 2} {...common} />
      ) : (
        <Rect x={0} y={0} width={width} height={height} {...common} />
      )}
    </Group>
  );
}

function PreviewDrawing({ item, pageIndex }) {
  if (item?.type === 'image') {
    return <DrawingImageLayer key={item.id ?? `${pageIndex}-image-${item.x}-${item.y}`} item={item} editable={false} selected={false} />;
  }
  if (item?.type === 'shape') return <PreviewShapeDrawing item={item} pageIndex={pageIndex} />;
  if (item?.type === 'line') return <PreviewLineDrawing item={item} pageIndex={pageIndex} />;
  return null;
}

function PreviewDrawingPlane({ project, pageIndex, plane }) {
  const drawings = drawingLayersForPage(project.extraLayers, pageIndex)
    .filter((item) => (item?.plane === 'back' ? 'back' : 'front') === plane);

  return (
    <Group listening={false}>
      {drawings.map((item) => <PreviewDrawing key={item.id} item={item} pageIndex={pageIndex} />)}
    </Group>
  );
}

function PreviewTextLayers({ project, pageIndex }) {
  const texts = textLayersForPage(project.extraLayers, pageIndex);

  return (
    <Group listening={false}>
      {texts.map((item) => (
        <Text
          key={item.id ?? `${pageIndex}-text-${item.x}-${item.y}`}
          x={Number(item.x) || 0}
          y={Number(item.y) || 0}
          width={Math.max(1, Number(item.width) || 500)}
          text={String(item.text ?? '')}
          fontSize={Math.max(1, Number(item.fontSize) || 56)}
          fontFamily={item.fontFamily || 'Arial, sans-serif'}
          fontStyle={`${item.fontStyle === 'italic' ? 'italic' : 'normal'} ${Number(item.fontWeight) || 500}`}
          lineHeight={Number(item.lineHeight) || 1.18}
          fill={item.color || '#1f2723'}
          wrap="word"
          listening={false}
        />
      ))}
    </Group>
  );
}

function PreviewPageNumber({ pageIndex, canvas, settings }) {
  const numbering = normalizePageNumbering(settings);
  const value = pageNumberValue(pageIndex, numbering);
  if (!Number.isFinite(value) || pageIndex < 0) return null;
  const placement = pageNumberPlacement(pageIndex, canvas, numbering);
  const size = Math.max(placement.fontSize * 2.15, 58);
  const left = placement.x - size / 2;
  const top = placement.y - size / 2;
  const center = size / 2;
  const strokeWidth = Math.max(1.2, placement.fontSize / 18);
  const shapeInset = Math.max(4, size * 0.12);

  return (
    <Group x={left} y={top} width={size} height={size} opacity={placement.opacity} listening={false}>
      {placement.style === 'circle' && <Rect x={shapeInset} y={shapeInset} width={size - shapeInset * 2} height={size - shapeInset * 2} cornerRadius={size} stroke={placement.color} strokeWidth={strokeWidth} listening={false} />}
      {placement.style === 'square' && <Rect x={shapeInset} y={shapeInset} width={size - shapeInset * 2} height={size - shapeInset * 2} stroke={placement.color} strokeWidth={strokeWidth} listening={false} />}
      {placement.style === 'heart' && <Text x={0} y={-size * 0.18} width={size} height={size * 1.25} text="♡" align="center" verticalAlign="middle" fontFamily="Arial, sans-serif" fontSize={size * 1.18} fill={placement.color} listening={false} />}
      {placement.style === 'line' && <Line points={[size * 0.2, size * 0.78, size * 0.8, size * 0.78]} stroke={placement.color} strokeWidth={strokeWidth} listening={false} />}
      <Text
        x={0}
        y={center - placement.fontSize * 0.66}
        width={size}
        height={placement.fontSize * 1.45}
        text={String(value)}
        align="center"
        verticalAlign="middle"
        fontFamily={placement.fontFamily}
        fontSize={placement.fontSize}
        fill={placement.color}
        listening={false}
      />
    </Group>
  );
}

export function AlbumPagePreview({ project, pageIndex }) {
  const canvas = project.canvas || { width: 1480, height: 2100 };
  const settings = project.settings || {};
  const page = project.pages?.[pageIndex];
  const height = Math.max(1, Math.round(PREVIEW_WIDTH * canvas.height / Math.max(1, canvas.width)));
  const scale = PREVIEW_WIDTH / Math.max(1, canvas.width);
  const frames = useMemo(
    () => [...(page?.frames || [])].sort((a, b) => (Number(a.zIndex) || 0) - (Number(b.zIndex) || 0)),
    [page],
  );

  return (
    <Stage className="album-flip-stage" width={PREVIEW_WIDTH} height={height} listening={false}>
      <Layer scaleX={scale} scaleY={scale} listening={false}>
        <Rect width={canvas.width} height={canvas.height} fill={settings.borderColor || '#ffffff'} listening={false} />
        <PreviewDrawingPlane project={project} pageIndex={pageIndex} plane="back" />
        {!page?.isBlankPage && frames.map((frame) => <PreviewFrame key={frame.id} frame={frame} settings={settings} />)}
        <PreviewDrawingPlane project={project} pageIndex={pageIndex} plane="front" />
        <PreviewTextLayers project={project} pageIndex={pageIndex} />
        <PreviewPageNumber pageIndex={pageIndex} canvas={canvas} settings={settings.pageNumbering} />
      </Layer>
    </Stage>
  );
}

function findCurrentPageIndex(project) {
  const pages = Array.isArray(project?.pages) ? project.pages : [];
  const index = pages.findIndex((page) => page?.id === project?.currentPageId);
  return Math.max(0, index);
}

export default function AlbumFlipPreviewHost() {
  const [headerTarget, setHeaderTarget] = useState(null);
  const [project, setProject] = useState(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const findTarget = () => setHeaderTarget(document.querySelector('.app-header-actions-v2'));
    findTarget();
    const observer = new MutationObserver(findTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  async function openPreview() {
    if (loading) return;
    const snapshot = window.__collageApp?.getProject?.();
    if (!snapshot?.pages?.length) return;
    setLoading(true);
    try {
      const hydrated = await hydratePhotoProject(snapshot);
      setProject(hydrated);
      setOpen(true);
    } catch (error) {
      console.warn('Album flip preview could not prepare photos', error);
      setProject(snapshot);
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }

  const launcher = headerTarget ? createPortal(
    <button className="button album-flip-open-button" type="button" disabled={loading} onClick={openPreview}>
      {loading ? 'Готовлю альбом…' : 'Листать альбом'}
    </button>,
    headerTarget,
  ) : null;

  return (
    <>
      {launcher}
      {project && (
        <AlbumFlipPreview
          open={open}
          pageCount={project.pages.length}
          startPageIndex={findCurrentPageIndex(project)}
          pageAspect={(project.canvas?.width || 1480) / Math.max(1, project.canvas?.height || 2100)}
          renderPage={(pageIndex) => <AlbumPagePreview project={project} pageIndex={pageIndex} />}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
