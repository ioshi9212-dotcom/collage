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
    8: [3, 3, 2],
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

function finiteFrameSize(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= MIN_FRAME ? Math.round(number) : null;
}

function countLayoutFrames(layout) {
  if (!layout?.rows) return 0;
  return layout.rows.reduce((sum, row) => sum + (Array.isArray(row.columns) ? row.columns.length : 0), 0);
}

function safeCanvasSize(value) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.max(MIN_FRAME, number) : MIN_FRAME;
}

function fitGridMetrics(canvas, rowsShape, requestedPadding, requestedGap) {
  const width = safeCanvasSize(canvas?.width);
  const height = safeCanvasSize(canvas?.height);
  const rowCount = Math.max(1, rowsShape.length);
  const maxColumns = Math.max(1, ...rowsShape);
  const requestedPaddingValue = Math.max(0, Math.round(Number(requestedPadding) || 0));
  const requestedGapValue = Math.max(0, Math.round(Number(requestedGap) || 0));
  const maxPaddingX = Math.floor((width - maxColumns * MIN_FRAME) / 2);
  const maxPaddingY = Math.floor((height - rowCount * MIN_FRAME) / 2);
  const maxPadding = Math.max(0, Math.min(maxPaddingX, maxPaddingY));
  const padding = Math.min(requestedPaddingValue, maxPadding);
  const maxGapX = maxColumns > 1
    ? Math.floor((width - padding * 2 - maxColumns * MIN_FRAME) / (maxColumns - 1))
    : Number.POSITIVE_INFINITY;
  const maxGapY = rowCount > 1
    ? Math.floor((height - padding * 2 - rowCount * MIN_FRAME) / (rowCount - 1))
    : Number.POSITIVE_INFINITY;
  const maxGap = Math.max(0, Math.min(maxGapX, maxGapY));
  const gap = Math.min(requestedGapValue, maxGap);

  return { width, height, padding, gap };
}

function fitTrackSizes(values, availableSize) {
  const count = Math.max(1, values.length);
  const available = Math.max(count * MIN_FRAME, Math.round(Number(availableSize) || 0));
  const extra = available - count * MIN_FRAME;
  const weights = values.map((value) => Math.max(0, (Number(value) || MIN_FRAME) - MIN_FRAME));
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  const exactExtras = weights.map((weight) => (
    weightTotal > 0 ? extra * (weight / weightTotal) : extra / count
  ));
  const extras = exactExtras.map(Math.floor);
  let remainder = extra - extras.reduce((sum, value) => sum + value, 0);
  const remainderOrder = exactExtras
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);

  for (let index = 0; remainder > 0; index += 1, remainder -= 1) {
    extras[remainderOrder[index % remainderOrder.length].index] += 1;
  }

  return extras.map((value) => MIN_FRAME + value);
}

function layoutCanFitMinimum(layout, canvas) {
  if (layout?.type !== 'grid' || !Array.isArray(layout.rows) || !layout.rows.length) return false;
  const rowCount = layout.rows.length;
  const maxColumns = Math.max(1, ...layout.rows.map((row) => Math.max(0, row?.columns?.length ?? 0)));
  return safeCanvasSize(canvas?.width) >= maxColumns * MIN_FRAME
    && safeCanvasSize(canvas?.height) >= rowCount * MIN_FRAME;
}

function syncGridLayoutToFrames(layout, previousFrames = [], canvas) {
  if (layout?.type !== 'grid' || !Array.isArray(layout.rows)) return layout;

  const previousById = new Map(previousFrames.map((frame) => [frame.id, frame]));
  const next = structuredClone(layout);
  const rowsShape = next.rows.map((row) => Math.max(1, row?.columns?.length ?? 0));
  const metrics = fitGridMetrics(canvas, rowsShape, next.padding, next.gap);
  next.padding = metrics.padding;
  next.gap = metrics.gap;

  next.rows.forEach((row) => {
    const rowFrames = row.columns.map((column) => previousById.get(column.frameId)).filter(Boolean);
    const heights = rowFrames.map((frame) => finiteFrameSize(frame.height)).filter((height) => height !== null);
    if (heights.length) row.height = Math.max(...heights);

    row.columns.forEach((column) => {
      const frame = previousById.get(column.frameId);
      const width = finiteFrameSize(frame?.width);
      if (width !== null) column.width = width;
    });

    const availableWidth = metrics.width - metrics.padding * 2 - metrics.gap * Math.max(0, row.columns.length - 1);
    const widths = fitTrackSizes(row.columns.map((column) => column.width), availableWidth);
    row.columns.forEach((column, index) => {
      column.width = widths[index];
    });
  });

  const availableHeight = metrics.height - metrics.padding * 2 - metrics.gap * Math.max(0, next.rows.length - 1);
  const heights = fitTrackSizes(next.rows.map((row) => row.height), availableHeight);
  next.rows.forEach((row, index) => {
    row.height = heights[index];
  });

  return next;
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
  const metrics = fitGridMetrics(canvas, rowsShape, settings.padding, settings.gap);
  const availableHeight = metrics.height - metrics.padding * 2 - metrics.gap * Math.max(0, rowsShape.length - 1);
  const rowHeights = fitTrackSizes(rowsShape.map(() => MIN_FRAME), availableHeight);
  let frameIndex = 0;

  const layout = {
    type: 'grid',
    padding: metrics.padding,
    gap: metrics.gap,
    rows: rowsShape.map((columnsCount, rowIndex) => {
      const availableWidth = metrics.width - metrics.padding * 2 - metrics.gap * Math.max(0, columnsCount - 1);
      const columnWidths = fitTrackSizes(Array.from({ length: columnsCount }, () => MIN_FRAME), availableWidth);
      const columns = Array.from({ length: columnsCount }, (_, columnIndex) => {
        const column = {
          id: columnIdAt(rowIndex, columnIndex),
          frameId: frameIdAt(previousFrames, frameIndex),
          width: columnWidths[columnIndex],
        };
        frameIndex += 1;
        return column;
      });

      return {
        id: rowIdAt(rowIndex),
        height: rowHeights[rowIndex],
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
  const frameCount = Number(settings.frameCount) || countLayoutFrames(page?.layout) || page?.frames?.length || 5;
  const expectedCount = Math.max(1, Math.min(9, frameCount));
  const layoutCount = countLayoutFrames(page?.layout);

  if (
    page?.layout?.type === 'grid'
    && Array.isArray(page.layout.rows)
    && layoutCount === expectedCount
    && layoutCanFitMinimum(page.layout, canvas)
  ) {
    return syncGridLayoutToFrames(page.layout, page.frames ?? [], canvas);
  }

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
  if (left.width + right.width < MIN_FRAME * 2) return layout;
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
  if (top.height + bottom.height < MIN_FRAME * 2) return layout;

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
