import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/AppLive.jsx';
let source = readFileSync(path, 'utf8');

function replaceOnce(before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Missing patch target: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`Patch target is not unique: ${label}`);
  source = source.replace(before, after);
}

replaceOnce(
  "} from './editor/frameModel';\nimport {\n  ALBUM_LAYERS_KEY,",
  "} from './editor/frameModel';\nimport { addFreeFrameToPage, removeFreeFrameFromPage } from './editor/freeFrameActions';\nimport {\n  ALBUM_LAYERS_KEY,",
  'free frame actions import',
);

replaceOnce(
  '{!collagePreviewOnly && !printMode && locked && (\n        <GridHandles',
  '{!collagePreviewOnly && !printMode && locked && page.layout && (\n        <GridHandles',
  'empty locked layout guard',
);

const oldDelete = `  function deleteSelectedFrame() {
    if (!selectedFrame || !currentPage) return;
    const frameCount = resolvePageFrameCount(currentPage, settings);
    if (frameCount <= 0) return show('На странице уже нет фото-окон');
    const nextFrameCount = frameCount - 1;
    const keptFrames = removeFrameById(currentPage.frames, selectedFrame.id);
    const nextSettings = { ...settings, frameCount: nextFrameCount };
    setSettings(nextSettings);
    setAlbum((current) => ({
      ...current,
      pages: current.pages.map((page) => {
        if (page.id !== current.currentPageId) return page;
        if (nextFrameCount <= 0) return { ...page, frameCount: 0, layout: null, frames: [] };
        const pageSettings = settingsForPage(nextSettings, page, nextFrameCount);
        const built = buildGridLayout(canvas, pageSettings, keptFrames);
        return { ...page, frameCount: nextFrameCount, layout: built.layout, frames: built.frames };
      }),
    }));
    setSelectedFrameId(null);
    setMoveFrameWithPhotoId(null);
    show(nextFrameCount > 0 ? \`Окно удалено. На странице \${currentPageIndex + 1}: \${nextFrameCount} фото-окон\` : \`На странице \${currentPageIndex + 1} больше нет фото-окон\`);
  }`;

const newActions = `  function addFreeFrame() {
    if (!currentPage || currentPage.isBlankPage) return show('На пустую страницу нельзя добавить фото-окно');
    const existingFrames = Array.isArray(currentPage.frames) ? currentPage.frames : [];
    if (existingFrames.length >= 9) return show('На странице можно разместить не больше 9 фото-окон');

    const nextFrameCount = existingFrames.length + 1;
    const nextSettings = { ...settings, frameCount: nextFrameCount, frameMode: 'free' };
    const result = addFreeFrameToPage(currentPage, canvas, nextSettings, makeId);
    if (!result.frame) return show('Не удалось добавить фото-окно');

    setSettings(nextSettings);
    setAlbum((current) => ({
      ...current,
      pages: current.pages.map((page) => (page.id === currentPage.id ? result.page : page)),
    }));
    setSelectedFrameId(result.frame.id);
    setMoveFrameWithPhotoId(null);
    setInspectorTab('object');
    show(locked
      ? 'Окно добавлено без перестройки. Включён свободный режим.'
      : 'Окно добавлено. Остальные окна остались на своих местах.');
  }

  function deleteSelectedFrame() {
    if (!selectedFrame || !currentPage) return;
    const frameCount = resolvePageFrameCount(currentPage, settings);
    if (frameCount <= 0) return show('На странице уже нет фото-окон');
    const nextFrameCount = frameCount - 1;
    const nextSettings = { ...settings, frameCount: nextFrameCount };

    if (!locked) {
      const nextPage = removeFreeFrameFromPage(currentPage, selectedFrame.id, canvas, nextSettings);
      setSettings(nextSettings);
      setAlbum((current) => ({
        ...current,
        pages: current.pages.map((page) => (page.id === currentPage.id ? nextPage : page)),
      }));
      setSelectedFrameId(null);
      setMoveFrameWithPhotoId(null);
      show(nextFrameCount > 0
        ? \`Окно удалено без перестройки. Осталось: \${nextFrameCount}\`
        : \`На странице \${currentPageIndex + 1} больше нет фото-окон\`);
      return;
    }

    const keptFrames = removeFrameById(currentPage.frames, selectedFrame.id);
    setSettings(nextSettings);
    setAlbum((current) => ({
      ...current,
      pages: current.pages.map((page) => {
        if (page.id !== current.currentPageId) return page;
        if (nextFrameCount <= 0) return { ...page, frameCount: 0, layout: null, frames: [] };
        const pageSettings = settingsForPage(nextSettings, page, nextFrameCount);
        const built = buildGridLayout(canvas, pageSettings, keptFrames);
        return { ...page, frameCount: nextFrameCount, layout: built.layout, frames: built.frames };
      }),
    }));
    setSelectedFrameId(null);
    setMoveFrameWithPhotoId(null);
    show(nextFrameCount > 0 ? \`Окно удалено. На странице \${currentPageIndex + 1}: \${nextFrameCount} фото-окон\` : \`На странице \${currentPageIndex + 1} больше нет фото-окон\`);
  }`;

replaceOnce(oldDelete, newActions, 'free add and delete handlers');

const collageControls = `              <div className="panel-title compact"><div><h2>Коллаж</h2><p>Сетка и размеры фото-окон текущей страницы.</p></div></div>
              <label className="field"><span>Фото-окон</span><select value={currentPage?.isBlankPage ? 0 : currentPageFrameCount} disabled={Boolean(currentPage?.isBlankPage)} onChange={(event) => updateSetting('frameCount', Number(event.target.value))}>{currentPage?.isBlankPage ? <option value={0}>пустая</option> : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((count) => <option key={count} value={count}>{count === 0 ? 'нет' : count}</option>)}</select></label>`;

const collageControlsWithAdd = `              <div className="panel-title compact"><div><h2>Коллаж</h2><p>Сетка и размеры фото-окон текущей страницы.</p></div></div>
              <label className="field"><span>Фото-окон</span><select value={currentPage?.isBlankPage ? 0 : currentPageFrameCount} disabled={Boolean(currentPage?.isBlankPage)} onChange={(event) => updateSetting('frameCount', Number(event.target.value))}>{currentPage?.isBlankPage ? <option value={0}>пустая</option> : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((count) => <option key={count} value={count}>{count === 0 ? 'нет' : count}</option>)}</select></label>
              <button className="button full accent" onClick={addFreeFrame} disabled={Boolean(currentPage?.isBlankPage) || currentPageFrameCount >= 9}>+ Добавить окно</button>
              <p className="hint">Добавление и удаление в свободном режиме не меняют положение и размеры остальных окон.</p>`;

replaceOnce(collageControls, collageControlsWithAdd, 'add window control');

writeFileSync(path, source);
console.log('Applied free-frame preservation patch');
