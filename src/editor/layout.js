export const MIN_FRAME = 80;

export function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

export function layoutRows(count) {
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

function frameIdAt(previousFrames, index) {
  return previousFrames[index]?.id ?? `frame_${index + 1}`;
}

function rowIdAt(index) {
  return `row_${index + 1}`;
}

function columnIdAt(rowIndex, columnIndex) {
  return `row_${rowIndex + 1}_column_${columnIndex + 1}`;
}

export function cleanFrame(frame, canvas) {
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

export function buildGridLayout(canvas, settings, previousFrames = []) {
  const rowsShape = layoutRows(Number(settings.frameCount) || 5);
  const padding = Math.min(
    Number(settings.padding) || 0,
    Math.floor(canvas.width / 3),
    Math.floor(canvas.height / 3)
  );
  const gap = Math.max(0, Number(settings.gap) || 0);
  const innerWidth = Math.max(MIN_FRAME, canvas.width - padding * 2);
  const innerHeight = Math.max(MIN_FRAME, canvas.height - padding * 2);
  const rowHeight = (innerHeight - gap * (rowsShape.length - 1)) / rowsShape.length;
  let frameIndex = 0;

  const layout = {
    type: 'grid',
    padding,
    gap,
    rows: rowsShape.map((columnsCount, rowIndex) => {
      const columnWidth = (innerWidth - gap * (columnsCount - 1)) / columnsCount;
      const columns = Array.from({ length: columnsCount }, (_, columnIndex) => {
        const column = {
          id: columnIdAt(rowIndex, columnIndex),
          frameId: frameIdAt(previousFrames, frameIndex),
          width: Math.round(columnWidth),
        };
        frameIndex += 1;
        return column;
      });

      return {
        id: rowIdAt(rowIndex),
        height: Math.round(rowHeight),
        columns,
      };
    }),
  };

  return {
    layout,
    frames: framesFromLayout(layout, previousFrames),
  };
}

export function framesFromLayout(layout, previousFrames = []) {
  const previousById = new Map(previousFrames.map((frame) => [frame.id, frame]));
  const frames = [];
  let y = layout.padding;

  layout.rows.forEach((row) => {
    let x = layout.padding;
    row.columns.forEach((column) => {
      const previous = previousById.get(column.frameId);
      frames.push({
        id: column.frameId,
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(column.width),
        height: Math.round(row.height),
        photo: previous?.photo ?? null,
        zIndex: previous?.zIndex ?? 0,
      });
      x += column.width + layout.gap;
    });
    y += row.height + layout.gap;
  });

  return frames;
}

export function ensureLayout(page, canvas, settings) {
  if (page?.layout?.type === 'grid' && Array.isArray(page.layout.rows)) return page.layout;
  return buildGridLayout(canvas, settings, page?.frames ?? []).layout;
}

export function getColumnHandles(layout) {
  const handles = [];
  let y = layout.padding;

  layout.rows.forEach((row, rowIndex) => {
    let x = layout.padding;
    for (let dividerIndex = 0; dividerIndex < row.columns.length - 1; dividerIndex += 1) {
      x += row.columns[dividerIndex].width;
      handles.push({
        key: `column_${row.id}_${dividerIndex}`,
        rowIndex,
        dividerIndex,
        x: x + layout.gap / 2,
        y,
        height: row.height,
      });
      x += layout.gap;
    }
    y += row.height + layout.gap;
  });

  return handles;
}

export function getRowHandles(layout) {
  const handles = [];
  let y = layout.padding;

  for (let rowIndex = 0; rowIndex < layout.rows.length - 1; rowIndex += 1) {
    const row = layout.rows[rowIndex];
    const rowWidth = row.columns.reduce((sum, column) => sum + column.width, 0) + layout.gap * Math.max(0, row.columns.length - 1);
    y += row.height;
    handles.push({
      key: `row_${rowIndex}`,
      rowIndex,
      x: layout.padding,
      y: y + layout.gap / 2,
      width: rowWidth,
    });
    y += layout.gap;
  }

  return handles;
}

export function resizeColumn(layout, rowIndex, dividerIndex, centerX) {
  const next = structuredClone(layout);
  const row = next.rows[rowIndex];
  if (!row || !row.columns[dividerIndex] || !row.columns[dividerIndex + 1]) return layout;

  let leftStart = next.padding;
  for (let i = 0; i < dividerIndex; i += 1) {
    leftStart += row.columns[i].width + next.gap;
  }

  const left = row.columns[dividerIndex];
  const right = row.columns[dividerIndex + 1];
  const rightEdge = leftStart + left.width + next.gap + right.width;
  const boundary = clamp(
    Math.round(centerX - next.gap / 2),
    leftStart + MIN_FRAME,
    rightEdge - next.gap - MIN_FRAME
  );

  left.width = boundary - leftStart;
  right.width = rightEdge - (boundary + next.gap);
  return next;
}

export function resizeRow(layout, rowIndex, centerY) {
  const next = structuredClone(layout);
  const top = next.rows[rowIndex];
  const bottom = next.rows[rowIndex + 1];
  if (!top || !bottom) return layout;

  let topStart = next.padding;
  for (let i = 0; i < rowIndex; i += 1) {
    topStart += next.rows[i].height + next.gap;
  }

  const bottomEdge = topStart + top.height + next.gap + bottom.height;
  const boundary = clamp(
    Math.round(centerY - next.gap / 2),
    topStart + MIN_FRAME,
    bottomEdge - next.gap - MIN_FRAME
  );

  top.height = boundary - topStart;
  bottom.height = bottomEdge - (boundary + next.gap);
  return next;
}
