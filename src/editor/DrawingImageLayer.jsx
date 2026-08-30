import { useEffect, useRef, useState } from 'react';
import { Group, Image as KonvaImage, Transformer } from 'react-konva';
import { colorizeDrawingImage } from './drawingColorization';

export default function DrawingImageLayer({ item, selected = false, editable = false, onSelect = () => {}, onChange = () => {} }) {
  const groupRef = useRef(null);
  const transformerRef = useRef(null);
  const [image, setImage] = useState(null);
  const width = Math.max(20, Number(item?.width) || 240);
  const height = Math.max(20, Number(item?.height) || 240);

  useEffect(() => {
    let cancelled = false;
    const source = new Image();
    source.decoding = 'async';
    source.onload = () => {
      if (!cancelled) setImage(colorizeDrawingImage(source, item?.color || '#000000'));
    };
    source.onerror = () => { if (!cancelled) setImage(null); };
    source.src = String(item?.src || '');
    return () => { cancelled = true; };
  }, [item?.src, item?.color]);

  useEffect(() => {
    const transformer = transformerRef.current;
    const group = groupRef.current;
    if (!transformer) return;
    transformer.nodes(selected && editable && group ? [group] : []);
    transformer.getLayer()?.batchDraw();
  }, [selected, editable, image, width, height]);

  if (!item?.src) return null;

  return (
    <>
      <Group
        ref={groupRef}
        x={Number(item.x) || 0}
        y={Number(item.y) || 0}
        rotation={Number(item.rotation) || 0}
        draggable={editable}
        onClick={(event) => { event.cancelBubble = true; onSelect(item.id); }}
        onTap={(event) => { event.cancelBubble = true; onSelect(item.id); }}
        onDragEnd={(event) => onChange(item.id, { x: event.target.x(), y: event.target.y() })}
        onTransformEnd={() => {
          const node = groupRef.current;
          if (!node) return;
          const scaleX = Math.max(0.05, Math.abs(node.scaleX()));
          const scaleY = Math.max(0.05, Math.abs(node.scaleY()));
          node.scaleX(1);
          node.scaleY(1);
          onChange(item.id, {
            x: node.x(),
            y: node.y(),
            rotation: node.rotation(),
            width: Math.max(20, width * scaleX),
            height: Math.max(20, height * scaleY),
          });
        }}
      >
        <KonvaImage
          image={image}
          x={0}
          y={0}
          width={width}
          height={height}
          offsetX={width / 2}
          offsetY={height / 2}
          scaleX={item.flipX ? -1 : 1}
          scaleY={item.flipY ? -1 : 1}
          opacity={Math.max(0, Math.min(1, Number(item.opacity ?? 1)))}
          listening={editable}
        />
      </Group>
      {editable && selected ? (
        <Transformer
          ref={transformerRef}
          rotateEnabled
          keepRatio
          flipEnabled={false}
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
          boundBoxFunc={(oldBox, newBox) => (Math.abs(newBox.width) < 20 || Math.abs(newBox.height) < 20 ? oldBox : newBox)}
        />
      ) : null}
    </>
  );
}
