import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Missing patch target: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`Patch target is not unique: ${label}`);
  return source.replace(before, after);
}

const appPath = 'src/AppLive.jsx';
let app = readFileSync(appPath, 'utf8');

app = replaceOnce(
  app,
  "import PhotoImportReport from './editor/PhotoImportReport';\n",
  "import PhotoImportReport from './editor/PhotoImportReport';\nimport CollagePresetPicker from './editor/CollagePresetPicker';\n",
  'preset picker import',
);

app = replaceOnce(
  app,
  "import { addFreeFrameToPage, removeFreeFrameFromPage } from './editor/freeFrameActions';\n",
  "import { addFreeFrameToPage, removeFreeFrameFromPage } from './editor/freeFrameActions';\nimport { applyCollagePresetToPage } from './editor/collagePresetCatalog';\n",
  'preset model import',
);

const applyHandler = `  function applyCollagePreset(preset) {
    if (!currentPage || currentPage.isBlankPage) return show('На пустую страницу нельзя применить композицию');
    const filledBefore = Array.isArray(currentPage.frames)
      ? currentPage.frames.filter((frame) => frame?.photo).length
      : 0;
    const nextPage = applyCollagePresetToPage(currentPage, preset, canvas, makeId);
    const nextSettings = { ...settings, frameCount: preset.count, frameMode: 'free' };
    const removedFromPage = Math.max(0, filledBefore - preset.count);

    setSettings(nextSettings);
    setAlbum((current) => ({
      ...current,
      pages: current.pages.map((page) => (page.id === currentPage.id ? nextPage : page)),
    }));
    setSelectedFrameId(nextPage.frames[0]?.id ?? null);
    setMoveFrameWithPhotoId(null);
    setFrameSnapGuides(null);
    setInspectorTab('object');
    show(removedFromPage
      ? \`Композиция «\${preset.name}» применена. Лишние фото остались в библиотеке: \${removedFromPage}\`
      : \`Композиция «\${preset.name}» применена\`);
  }

`;

app = replaceOnce(
  app,
  '  function addFreeFrame() {',
  `${applyHandler}  function addFreeFrame() {`,
  'preset apply handler',
);

const oldControls = `              <label className="field"><span>Фото-окон</span><select value={currentPage?.isBlankPage ? 0 : currentPageFrameCount} disabled={Boolean(currentPage?.isBlankPage)} onChange={(event) => updateSetting('frameCount', Number(event.target.value))}>{currentPage?.isBlankPage ? <option value={0}>пустая</option> : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((count) => <option key={count} value={count}>{count === 0 ? 'нет' : count}</option>)}</select></label>
              <button className="button full accent" onClick={addFreeFrame} disabled={Boolean(currentPage?.isBlankPage) || currentPageFrameCount >= 9}>+ Добавить окно</button>`;

const newControls = `              <label className="field"><span>Фото-окон</span><select value={currentPage?.isBlankPage ? 0 : currentPageFrameCount} disabled={Boolean(currentPage?.isBlankPage)} onChange={(event) => updateSetting('frameCount', Number(event.target.value))}>{currentPage?.isBlankPage ? <option value={0}>пустая</option> : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((count) => <option key={count} value={count}>{count === 0 ? 'нет' : count}</option>)}</select></label>
              <CollagePresetPicker activeCount={currentPageFrameCount} disabled={Boolean(currentPage?.isBlankPage)} onApply={applyCollagePreset} />
              <button className="button full accent" onClick={addFreeFrame} disabled={Boolean(currentPage?.isBlankPage) || currentPageFrameCount >= 9}>+ Добавить окно</button>`;

app = replaceOnce(app, oldControls, newControls, 'preset picker controls');
writeFileSync(appPath, app);

const catalogPath = 'src/editor/collagePresetCatalog.js';
let catalog = readFileSync(catalogPath, 'utf8');
catalog = replaceOnce(
  catalog,
  "frames: [frame(0.05, 0.05, 0.55, 0.9), frame(0.64, 0.05, 0.31, 0.43), frame(0.64, 0.52, 0.31, 0.43), frame(0.64, 0.05, 0.14, 0.2, 2), frame(0.81, 0.76, 0.14, 0.19, 3)],",
  "frames: [frame(0.05, 0.05, 0.55, 0.9), frame(0.64, 0.05, 0.145, 0.43), frame(0.805, 0.05, 0.145, 0.43), frame(0.64, 0.52, 0.145, 0.43), frame(0.805, 0.52, 0.145, 0.43)],",
  'five photo right grid geometry',
);
writeFileSync(catalogPath, catalog);

console.log('Applied mixed collage preset integration');
