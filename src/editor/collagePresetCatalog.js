import { MIN_FRAME, clamp } from './layout.js';

export const COLLAGE_PRESET_CATEGORIES = [
  { id: 'all', label: 'Все' },
  { id: 'grid', label: 'Сетка' },
  { id: 'asymmetric', label: 'Асимметрия' },
  { id: 'overlay', label: 'Фото поверх' },
  { id: 'overlap', label: 'Внахлёст' },
  { id: 'magazine', label: 'Журнальные' },
];

export const COLLAGE_PRESET_COUNTS = [3, 4, 5, 6];

function frame(x, y, width, height, zIndex = 1) {
  return { x, y, width, height, zIndex };
}

export const COLLAGE_PRESET_CATALOG = [
  {
    id: 'three-main-right-stack',
    count: 3,
    category: 'asymmetric',
    name: 'Большое слева + 2 справа',
    description: 'Одно большое вертикальное фото слева, справа два небольших.',
    frames: [frame(0.05, 0.05, 0.56, 0.9), frame(0.65, 0.05, 0.3, 0.43), frame(0.65, 0.52, 0.3, 0.43)],
  },
  {
    id: 'three-top-bottom',
    count: 3,
    category: 'grid',
    name: '1 сверху + 2 снизу',
    description: 'Широкое акцентное фото сверху и два равных окна снизу.',
    frames: [frame(0.05, 0.05, 0.9, 0.5), frame(0.05, 0.59, 0.43, 0.36), frame(0.52, 0.59, 0.43, 0.36)],
  },
  {
    id: 'three-background-overlay',
    count: 3,
    category: 'overlay',
    name: 'Фон + 2 поверх',
    description: 'Одно фото на всю страницу, поверх два небольших окна.',
    frames: [frame(0, 0, 1, 1, 0), frame(0.07, 0.64, 0.39, 0.29, 2), frame(0.56, 0.1, 0.36, 0.31, 3)],
  },
  {
    id: 'three-overlap-fan',
    count: 3,
    category: 'overlap',
    name: '3 фото веером',
    description: 'Три крупных снимка мягко заходят друг на друга.',
    frames: [frame(0.06, 0.07, 0.58, 0.62, 1), frame(0.36, 0.25, 0.58, 0.62, 2), frame(0.17, 0.58, 0.55, 0.35, 3)],
  },
  {
    id: 'three-center-accent',
    count: 3,
    category: 'magazine',
    name: 'Центральное + 2 акцента',
    description: 'Крупное центральное фото и два дополнительных по диагонали.',
    frames: [frame(0.21, 0.14, 0.58, 0.72, 2), frame(0.05, 0.05, 0.32, 0.31, 1), frame(0.63, 0.64, 0.32, 0.31, 3)],
  },

  {
    id: 'four-grid-2x2',
    count: 4,
    category: 'grid',
    name: 'Сетка 2×2',
    description: 'Четыре равных окна с аккуратными промежутками.',
    frames: [frame(0.05, 0.05, 0.43, 0.43), frame(0.52, 0.05, 0.43, 0.43), frame(0.05, 0.52, 0.43, 0.43), frame(0.52, 0.52, 0.43, 0.43)],
  },
  {
    id: 'four-main-left-three',
    count: 4,
    category: 'asymmetric',
    name: 'Большое слева + 3 справа',
    description: 'Одно высокое главное фото и три последовательных кадра.',
    frames: [frame(0.05, 0.05, 0.58, 0.9), frame(0.67, 0.05, 0.28, 0.28), frame(0.67, 0.36, 0.28, 0.28), frame(0.67, 0.67, 0.28, 0.28)],
  },
  {
    id: 'four-top-strip-bottom-three',
    count: 4,
    category: 'asymmetric',
    name: 'Широкое сверху + 3 снизу',
    description: 'Панорамный верхний кадр и три небольших окна внизу.',
    frames: [frame(0.05, 0.05, 0.9, 0.48), frame(0.05, 0.57, 0.28, 0.38), frame(0.36, 0.57, 0.28, 0.38), frame(0.67, 0.57, 0.28, 0.38)],
  },
  {
    id: 'four-background-three-overlay',
    count: 4,
    category: 'overlay',
    name: 'Фон + 3 поверх',
    description: 'Большой фон и три карточки, собранные поверх него.',
    frames: [frame(0, 0, 1, 1, 0), frame(0.06, 0.08, 0.35, 0.28, 2), frame(0.58, 0.34, 0.36, 0.3, 3), frame(0.12, 0.67, 0.4, 0.27, 4)],
  },
  {
    id: 'four-overlap-scatter',
    count: 4,
    category: 'overlap',
    name: '4 фото вразброс',
    description: 'Четыре разных окна образуют живую многослойную композицию.',
    frames: [frame(0.05, 0.08, 0.5, 0.43, 1), frame(0.43, 0.05, 0.5, 0.38, 2), frame(0.12, 0.45, 0.48, 0.46, 3), frame(0.48, 0.48, 0.46, 0.44, 4)],
  },
  {
    id: 'four-magazine-mix',
    count: 4,
    category: 'magazine',
    name: 'Журнальный микс',
    description: 'Одно акцентное, два поддерживающих и один узкий кадр.',
    frames: [frame(0.07, 0.08, 0.55, 0.54, 2), frame(0.66, 0.08, 0.27, 0.34, 1), frame(0.66, 0.46, 0.27, 0.46, 3), frame(0.07, 0.67, 0.55, 0.25, 4)],
  },

  {
    id: 'five-main-left-grid',
    count: 5,
    category: 'asymmetric',
    name: 'Большое слева + 4 справа',
    description: 'Главное вертикальное фото и компактная сетка 2×2.',
    frames: [frame(0.05, 0.05, 0.55, 0.9), frame(0.64, 0.05, 0.145, 0.43), frame(0.805, 0.05, 0.145, 0.43), frame(0.64, 0.52, 0.145, 0.43), frame(0.805, 0.52, 0.145, 0.43)],
  },
  {
    id: 'five-top-main-bottom-four',
    count: 5,
    category: 'asymmetric',
    name: 'Широкое сверху + 4 снизу',
    description: 'Акцентный верхний кадр и четыре небольших окна ниже.',
    frames: [frame(0.05, 0.05, 0.9, 0.46), frame(0.05, 0.55, 0.2, 0.4), frame(0.28, 0.55, 0.2, 0.4), frame(0.52, 0.55, 0.2, 0.4), frame(0.75, 0.55, 0.2, 0.4)],
  },
  {
    id: 'five-background-four-overlay',
    count: 5,
    category: 'overlay',
    name: '1 фон + 4 поверх',
    description: 'Одно полноформатное фото и четыре небольших акцента поверх.',
    frames: [frame(0, 0, 1, 1, 0), frame(0.06, 0.08, 0.31, 0.25, 2), frame(0.63, 0.09, 0.31, 0.29, 3), frame(0.08, 0.68, 0.36, 0.25, 4), frame(0.59, 0.62, 0.35, 0.31, 5)],
  },
  {
    id: 'five-center-main-around',
    count: 5,
    category: 'magazine',
    name: 'Главное в центре + 4 вокруг',
    description: 'Большой центральный кадр и четыре небольших по углам.',
    frames: [frame(0.22, 0.18, 0.56, 0.64, 3), frame(0.05, 0.05, 0.3, 0.27, 1), frame(0.65, 0.05, 0.3, 0.27, 2), frame(0.05, 0.68, 0.3, 0.27, 4), frame(0.65, 0.68, 0.3, 0.27, 5)],
  },
  {
    id: 'five-overlap-cascade',
    count: 5,
    category: 'overlap',
    name: '5 фото каскадом',
    description: 'Кадры идут диагональным каскадом и частично перекрываются.',
    frames: [frame(0.04, 0.05, 0.48, 0.36, 1), frame(0.28, 0.17, 0.5, 0.38, 2), frame(0.49, 0.31, 0.47, 0.38, 3), frame(0.08, 0.48, 0.48, 0.4, 4), frame(0.35, 0.61, 0.52, 0.34, 5)],
  },
  {
    id: 'five-mixed-journal',
    count: 5,
    category: 'magazine',
    name: 'Журнальный коллаж',
    description: 'Большое, два средних и два маленьких окна с воздухом.',
    frames: [frame(0.05, 0.07, 0.56, 0.55, 2), frame(0.65, 0.07, 0.3, 0.34, 1), frame(0.65, 0.45, 0.3, 0.48, 4), frame(0.05, 0.67, 0.27, 0.26, 3), frame(0.35, 0.67, 0.26, 0.26, 5)],
  },

  {
    id: 'six-grid-3x2',
    count: 6,
    category: 'grid',
    name: 'Сетка 3×2',
    description: 'Шесть равных фото в чистой классической сетке.',
    frames: [frame(0.05, 0.05, 0.28, 0.43), frame(0.36, 0.05, 0.28, 0.43), frame(0.67, 0.05, 0.28, 0.43), frame(0.05, 0.52, 0.28, 0.43), frame(0.36, 0.52, 0.28, 0.43), frame(0.67, 0.52, 0.28, 0.43)],
  },
  {
    id: 'six-main-left-five',
    count: 6,
    category: 'asymmetric',
    name: 'Большое слева + 5 справа',
    description: 'Одно главное фото и пять поддерживающих кадров справа.',
    frames: [frame(0.05, 0.05, 0.52, 0.9), frame(0.61, 0.05, 0.34, 0.28), frame(0.61, 0.36, 0.16, 0.27), frame(0.79, 0.36, 0.16, 0.27), frame(0.61, 0.66, 0.16, 0.29), frame(0.79, 0.66, 0.16, 0.29)],
  },
  {
    id: 'six-main-top-five',
    count: 6,
    category: 'asymmetric',
    name: 'Широкое сверху + 5 ниже',
    description: 'Панорамное главное фото и ритм из пяти кадров внизу.',
    frames: [frame(0.05, 0.05, 0.9, 0.43), frame(0.05, 0.52, 0.16, 0.43), frame(0.235, 0.52, 0.16, 0.43), frame(0.42, 0.52, 0.16, 0.43), frame(0.605, 0.52, 0.16, 0.43), frame(0.79, 0.52, 0.16, 0.43)],
  },
  {
    id: 'six-background-overlay',
    count: 6,
    category: 'overlay',
    name: 'Фон + 5 поверх',
    description: 'Фоновое фото и пять карточек разных размеров поверх него.',
    frames: [frame(0, 0, 1, 1, 0), frame(0.05, 0.07, 0.28, 0.24, 2), frame(0.66, 0.07, 0.29, 0.28, 3), frame(0.09, 0.4, 0.34, 0.28, 4), frame(0.58, 0.42, 0.36, 0.27, 5), frame(0.27, 0.7, 0.46, 0.25, 6)],
  },
  {
    id: 'six-overlap-story',
    count: 6,
    category: 'overlap',
    name: 'История из 6 фото',
    description: 'Шесть карточек образуют плотную, но читаемую историю.',
    frames: [frame(0.04, 0.05, 0.43, 0.34, 1), frame(0.31, 0.11, 0.45, 0.35, 2), frame(0.57, 0.2, 0.39, 0.34, 3), frame(0.07, 0.4, 0.43, 0.38, 4), frame(0.34, 0.49, 0.44, 0.39, 5), frame(0.58, 0.63, 0.36, 0.31, 6)],
  },
  {
    id: 'six-magazine-balanced',
    count: 6,
    category: 'magazine',
    name: 'Журнальный баланс',
    description: 'Разные размеры собраны в спокойную редакционную композицию.',
    frames: [frame(0.05, 0.06, 0.53, 0.48, 2), frame(0.62, 0.06, 0.33, 0.29, 1), frame(0.62, 0.39, 0.33, 0.32, 4), frame(0.05, 0.58, 0.25, 0.36, 3), frame(0.33, 0.58, 0.25, 0.36, 5), frame(0.62, 0.75, 0.33, 0.19, 6)],
  },
];

export function collagePresetsFor({ count, category = 'all' } = {}) {
  const safeCount = Number(count);
  return COLLAGE_PRESET_CATALOG.filter((preset) => (
    preset.count === safeCount && (category === 'all' || preset.category === category)
  ));
}

export function collagePresetById(id) {
  return COLLAGE_PRESET_CATALOG.find((preset) => preset.id === id) || null;
}

function frameForCanvas(definition, canvas, id, photo) {
  const canvasWidth = Math.max(MIN_FRAME, Math.round(Number(canvas?.width) || MIN_FRAME));
  const canvasHeight = Math.max(MIN_FRAME, Math.round(Number(canvas?.height) || MIN_FRAME));
  const width = clamp(Math.round(definition.width * canvasWidth), MIN_FRAME, canvasWidth);
  const height = clamp(Math.round(definition.height * canvasHeight), MIN_FRAME, canvasHeight);
  const x = clamp(Math.round(definition.x * canvasWidth), 0, Math.max(0, canvasWidth - width));
  const y = clamp(Math.round(definition.y * canvasHeight), 0, Math.max(0, canvasHeight - height));
  return {
    id,
    x,
    y,
    width,
    height,
    zIndex: Number(definition.zIndex) || 0,
    photo: photo || null,
  };
}

export function applyCollagePresetToPage(page, preset, canvas, idFactory) {
  if (!page || page.isBlankPage) return page;
  if (!preset || !Array.isArray(preset.frames) || preset.frames.length !== preset.count) {
    throw new Error('Некорректный шаблон коллажа');
  }
  if (typeof idFactory !== 'function') throw new TypeError('idFactory must be a function');

  const sourceFrames = Array.isArray(page.frames) ? page.frames : [];
  const photos = sourceFrames.map((item) => item?.photo).filter(Boolean);
  const frames = preset.frames.map((definition, index) => frameForCanvas(
    definition,
    canvas,
    sourceFrames[index]?.id || idFactory(),
    photos[index] || null,
  ));

  return {
    ...page,
    frameCount: preset.count,
    layout: null,
    frames,
    collagePresetId: preset.id,
  };
}
