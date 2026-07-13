let idCounter = 0;
const makeId = () => `fresh-${++idCounter}`;
const cloneDeep = (value) => JSON.parse(JSON.stringify(value));

function clonePageForDuplicate(page, number) {
  const next = cloneDeep(page) || {};
  const frameIdMap = new Map();
  const remapFrameId = (frameId) => {
    if (frameId == null) return makeId();
    if (!frameIdMap.has(frameId)) frameIdMap.set(frameId, makeId());
    return frameIdMap.get(frameId);
  };
  const frames = Array.isArray(next.frames)
    ? next.frames.map((frame) => ({ ...frame, id: remapFrameId(frame?.id) }))
    : [];
  let layout = next.layout ?? null;
  if (layout && Array.isArray(layout.rows)) {
    layout = {
      ...layout,
      rows: layout.rows.map((row) => ({
        ...row,
        id: makeId(),
        columns: Array.isArray(row?.columns)
          ? row.columns.map((column) => ({
            ...column,
            id: makeId(),
            frameId: remapFrameId(column?.frameId),
          }))
          : [],
      })),
    };
  }
  return { ...next, id: makeId(), title: `Страница ${number}`, layout, frames };
}

function runtimePageFromTemplate(page, index) {
  const next = clonePageForDuplicate(page, index + 1);
  return {
    ...next,
    title: `Страница ${index + 1}`,
    frames: Array.isArray(next?.frames) ? next.frames.map((frame) => ({ ...frame, photo: null })) : [],
  };
}

function cloneLayerPage(pageLayers) {
  if (!pageLayers) return null;
  const cloned = cloneDeep(pageLayers);
  ['texts', 'drawings', 'templates'].forEach((key) => {
    if (Array.isArray(cloned?.[key])) cloned[key] = cloned[key].map((item) => ({ ...item, id: makeId() }));
  });
  return cloned;
}

const source = {
  id: 'template-page',
  frames: [
    { id: 'frame-a', x: 10, y: 20, width: 300, height: 400, zIndex: 7, photo: { id: 'photo', zoom: 2 } },
    { id: 'frame-b', x: 330, y: 20, width: 200, height: 400, photo: null },
  ],
  layout: {
    type: 'grid',
    rows: [{ id: 'row-a', height: 400, columns: [
      { id: 'column-a', frameId: 'frame-a', width: 300 },
      { id: 'column-b', frameId: 'frame-b', width: 200 },
    ] }],
  },
};

const first = runtimePageFromTemplate(source, 0);
const second = runtimePageFromTemplate(source, 0);
if (first.id === second.id) throw new Error('page IDs collided');
if (first.frames.some((frame, index) => frame.id === second.frames[index].id)) throw new Error('frame IDs collided');
if (first.frames.some((frame) => frame.photo !== null)) throw new Error('template photos were not cleared');
if (first.frames[0].x !== 10 || first.frames[0].width !== 300 || first.frames[0].zIndex !== 7) throw new Error('geometry changed');
const ids = new Set(first.frames.map((frame) => frame.id));
for (const row of first.layout.rows) for (const column of row.columns) if (!ids.has(column.frameId)) throw new Error('broken layout reference');
if (source.frames[0].id !== 'frame-a' || source.frames[0].photo.zoom !== 2) throw new Error('source mutated');

const layers = { texts: [{ id: 'text-a', text: 'Title' }], drawings: [{ id: 'line-a', type: 'line' }], templates: [] };
const firstLayers = cloneLayerPage(layers);
const secondLayers = cloneLayerPage(layers);
if (firstLayers.texts[0].id === secondLayers.texts[0].id) throw new Error('text IDs collided');
if (firstLayers.drawings[0].id === secondLayers.drawings[0].id) throw new Error('drawing IDs collided');
if (layers.texts[0].id !== 'text-a' || layers.drawings[0].id !== 'line-a') throw new Error('layer source mutated');

console.log('independent template instance checks passed');
