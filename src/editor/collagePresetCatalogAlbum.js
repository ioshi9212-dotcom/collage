const PAGE_ASPECT = 148 / 210;
const MARGIN = .04;
const GAP = .02;
const INNER = 1 - MARGIN * 2;

function frame(x, y, width, height, zIndex = 1) {
  return { x, y, width, height, zIndex };
}

function rowLayout(rowCounts, { widths = [], aligns = [] } = {}) {
  const desiredHeights = rowCounts.map((count, index) => {
    const rowWidth = INNER * (widths[index] ?? 1);
    const cellWidth = (rowWidth - GAP * (count - 1)) / count;
    return cellWidth * PAGE_ASPECT;
  });
  const availableHeight = INNER - GAP * (rowCounts.length - 1);
  const scale = Math.min(1.7, availableHeight / desiredHeights.reduce((sum, value) => sum + value, 0));
  const heights = desiredHeights.map((value) => value * scale);
  const frames = [];
  const usedHeight = heights.reduce((sum, value) => sum + value, 0) + GAP * (rowCounts.length - 1);
  let y = (1 - usedHeight) / 2;

  rowCounts.forEach((count, rowIndex) => {
    const rowWidth = INNER * (widths[rowIndex] ?? 1);
    const align = aligns[rowIndex] ?? 'center';
    const x = align === 'left' ? MARGIN : align === 'right' ? 1 - MARGIN - rowWidth : (1 - rowWidth) / 2;
    const cellWidth = (rowWidth - GAP * (count - 1)) / count;
    for (let column = 0; column < count; column += 1) {
      frames.push(frame(x + column * (cellWidth + GAP), y, cellWidth, heights[rowIndex]));
    }
    y += heights[rowIndex] + GAP;
  });

  return frames;
}

function staggeredPair({ reverse = false, portrait = false } = {}) {
  if (portrait) {
    const first = frame(.08, .08, .40, .49);
    const second = frame(.52, .43, .40, .49);
    return reverse ? [second, first] : [first, second];
  }
  const first = frame(.04, .08, .72, .38);
  const second = frame(.24, .54, .72, .38);
  return reverse ? [second, first] : [first, second];
}

const LAYOUT_SPECS = {
  2: [
    { rows: [2] },
    { rows: [1, 1] },
    { custom: staggeredPair() },
    { custom: staggeredPair({ reverse: true }) },
    { custom: staggeredPair({ portrait: true }) },
    { custom: staggeredPair({ portrait: true, reverse: true }) },
    { rows: [2], widths: [.86], aligns: ['left'] },
    { rows: [2], widths: [.86], aligns: ['right'] },
    { rows: [1, 1], widths: [.82, 1], aligns: ['left', 'right'] },
    { rows: [1, 1], widths: [1, .82], aligns: ['left', 'right'] },
  ],
  3: [
    { rows: [1, 2] }, { rows: [2, 1] }, { rows: [3] },
    { rows: [1, 2], widths: [.82, 1], aligns: ['left', 'right'] },
    { rows: [1, 2], widths: [.82, 1], aligns: ['right', 'left'] },
    { rows: [2, 1], widths: [1, .82], aligns: ['left', 'right'] },
    { rows: [2, 1], widths: [1, .82], aligns: ['right', 'left'] },
    { rows: [1, 1, 1], widths: [.78, .78, .78], aligns: ['left', 'center', 'right'] },
    { rows: [1, 1, 1], widths: [.78, .78, .78], aligns: ['right', 'center', 'left'] },
    { rows: [3], widths: [.88], aligns: ['center'] },
  ],
  4: [
    { rows: [2, 2] }, { rows: [1, 3] }, { rows: [3, 1] }, { rows: [4] },
    { rows: [1, 3], widths: [.82, 1], aligns: ['left', 'right'] },
    { rows: [1, 3], widths: [.82, 1], aligns: ['right', 'left'] },
    { rows: [3, 1], widths: [1, .82], aligns: ['left', 'right'] },
    { rows: [3, 1], widths: [1, .82], aligns: ['right', 'left'] },
    { rows: [2, 2], widths: [.88, 1], aligns: ['left', 'right'] },
    { rows: [2, 2], widths: [1, .88], aligns: ['left', 'right'] },
  ],
  5: [
    { rows: [2, 3] }, { rows: [3, 2] }, { rows: [1, 2, 2] }, { rows: [2, 1, 2] }, { rows: [2, 2, 1] },
    { rows: [1, 4], widths: [.78, 1], aligns: ['left', 'right'] },
    { rows: [1, 4], widths: [.78, 1], aligns: ['right', 'left'] },
    { rows: [4, 1], widths: [1, .78], aligns: ['left', 'right'] },
    { rows: [2, 3], widths: [.88, 1], aligns: ['left', 'right'] },
    { rows: [3, 2], widths: [1, .88], aligns: ['left', 'right'] },
  ],
  6: [
    { rows: [3, 3] }, { rows: [2, 2, 2] }, { rows: [1, 2, 3] }, { rows: [3, 2, 1] }, { rows: [2, 1, 3] },
    { rows: [3, 1, 2] }, { rows: [2, 3, 1] },
    { rows: [2, 4], widths: [.88, 1], aligns: ['left', 'right'] },
    { rows: [4, 2], widths: [1, .88], aligns: ['left', 'right'] },
    { rows: [3, 3], widths: [.90, 1], aligns: ['left', 'right'] },
  ],
  7: [
    { rows: [3, 4] }, { rows: [4, 3] }, { rows: [2, 2, 3] }, { rows: [3, 2, 2] }, { rows: [2, 3, 2] },
    { rows: [1, 3, 3] }, { rows: [3, 3, 1] },
    { rows: [2, 1, 4] }, { rows: [4, 1, 2] },
    { rows: [3, 4], widths: [.90, 1], aligns: ['left', 'right'] },
  ],
  8: [
    { rows: [4, 4] }, { rows: [3, 2, 3] }, { rows: [2, 3, 3] }, { rows: [3, 3, 2] },
    { rows: [2, 2, 2, 2] }, { rows: [1, 3, 4] }, { rows: [4, 3, 1] },
    { rows: [2, 4, 2] }, { rows: [3, 1, 4] },
    { rows: [4, 4], widths: [.90, 1], aligns: ['left', 'right'] },
  ],
  9: [
    { rows: [3, 3, 3] }, { rows: [4, 5] }, { rows: [5, 4] }, { rows: [2, 3, 4] }, { rows: [4, 3, 2] },
    { rows: [3, 2, 4] }, { rows: [4, 2, 3] }, { rows: [2, 2, 2, 3] },
    { rows: [3, 3, 3], widths: [.90, 1, .90], aligns: ['left', 'center', 'right'] },
    { rows: [1, 4, 4], widths: [.76, 1, 1], aligns: ['left', 'center', 'center'] },
  ],
};

const STYLE_NAMES = [
  'Спокойная история', 'Крупный ритм', 'Журнальная полоса', 'Мягкая асимметрия', 'Серия кадров',
  'Главное и детали', 'Зеркальная история', 'Воздушная сетка', 'Динамичная серия', 'Финальный ритм',
];

export const ALBUM_COLLAGE_PRESETS = Object.entries(LAYOUT_SPECS).flatMap(([count, specs]) =>
  specs.map((spec, index) => ({
    id: `album-${count}-${index + 1}`,
    count: Number(count),
    category: 'album',
    name: STYLE_NAMES[index],
    description: `${count} фото с естественными пропорциями для печатной страницы A5.`,
    frames: spec.custom ?? rowLayout(spec.rows, spec),
  })),
);
