import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const appPath = 'src/AppLive.jsx';
const mainPath = 'src/main.jsx';
const cssPath = 'src/photo-library-panel.css';
const testPath = 'e2e/photo-library-tabs.spec.js';

let app = readFileSync(appPath, 'utf8');
let main = readFileSync(mainPath, 'utf8');

function replaceOnce(source, before, after, label) {
  assert.ok(source.includes(before), `Cannot patch ${label}: source pattern not found`);
  const next = source.replace(before, after);
  assert.notEqual(next, source, `Cannot patch ${label}: replacement made no change`);
  return next;
}

app = replaceOnce(
  app,
  `  const [selectedPhotoId, setSelectedPhotoId] = useState(null);\n  const [photoImporting, setPhotoImporting] = useState(false);`,
  `  const [selectedPhotoId, setSelectedPhotoId] = useState(null);\n  const [photoLibraryView, setPhotoLibraryView] = useState('unused');\n  const [photoImporting, setPhotoImporting] = useState(false);`,
  'photo library tab state',
);

app = replaceOnce(
  app,
  `        if (frame.photo?.id) used.add(frame.photo.id);`,
  `        if (frame.photo?.id) used.add(String(frame.photo.id));`,
  'normalized used photo ids',
);

app = replaceOnce(
  app,
  `  const visibleLibrary = useMemo(\n    () => library.filter((photo) => !hiddenLibraryPhotoIds.has(String(photo.id))),\n    [library, hiddenLibraryPhotoIds],\n  );\n\n  async function recoverPhotos(event) {`,
  `  const visibleLibrary = useMemo(\n    () => library.filter((photo) => !hiddenLibraryPhotoIds.has(String(photo.id))),\n    [library, hiddenLibraryPhotoIds],\n  );\n  const usedLibraryPhotos = useMemo(\n    () => visibleLibrary.filter((photo) => usedPhotoIds.has(String(photo.id))),\n    [visibleLibrary, usedPhotoIds],\n  );\n  const unusedLibraryPhotos = useMemo(\n    () => visibleLibrary.filter((photo) => !usedPhotoIds.has(String(photo.id))),\n    [visibleLibrary, usedPhotoIds],\n  );\n  const photoLibraryItems = photoLibraryView === 'used' ? usedLibraryPhotos : unusedLibraryPhotos;\n  const photoOrderById = useMemo(\n    () => new Map(visibleLibrary.map((photo, index) => [String(photo.id), index + 1])),\n    [visibleLibrary],\n  );\n\n  async function recoverPhotos(event) {`,
  'photo library filtered collections',
);

const photoPanelPattern = /          \{leftPanel === 'photos' && \(\n            <>[\s\S]*?\n            <\/\>\n          \)\}\n\n          \{leftPanel === 'pages'/;
assert.match(app, photoPanelPattern, 'Cannot patch photo panel: panel block not found');
const photoPanelReplacement = String.raw`          {leftPanel === 'photos' && (
            <div className="photo-panel-v3">
              <div className="photo-panel-header-v3">
                <div className="panel-title compact photo-panel-title-v3">
                  <div><h2>Фото</h2><p>{visibleLibrary.length} загружено</p></div>
                  <span>{visibleLibrary.length}</span>
                </div>

                <div className="photo-panel-actions-v3">
                  <label className={\`button photo-panel-action-v3 ${photoImporting ? 'disabled' : ''}\`}>
                    <strong>{photoImporting ? 'Загрузка…' : '+ Загрузить'}</strong>
                    <input className="hidden-input" type="file" accept="image/*" multiple disabled={photoImporting} onChange={uploadPhotos} />
                  </label>
                  <label className={\`button photo-panel-action-v3 ${photoImporting ? 'disabled' : ''}\`}>
                    <strong>Восстановить</strong>
                    <input className="hidden-input" type="file" accept="image/*,.heic,.heif" multiple disabled={photoImporting} onChange={recoverPhotos} />
                  </label>
                </div>

                {photoImportProgress.visible && (
                  <div className={\`photo-upload-progress ${photoImportProgress.status}\`} aria-live="polite">
                    <div className="photo-upload-progress-head">
                      <strong>{photoImportProgress.label}</strong>
                      <span>{photoImportProgress.percent}%</span>
                    </div>
                    <div
                      className="photo-upload-progress-track"
                      role="progressbar"
                      aria-label={photoImportProgress.label || 'Загрузка фотографий'}
                      aria-valuemin="0"
                      aria-valuemax="100"
                      aria-valuenow={photoImportProgress.percent}
                      aria-valuetext={photoImportProgress.detail}
                    >
                      <i style={{ width: \`${photoImportProgress.percent}%\` }} />
                    </div>
                    <small>{photoImportProgress.detail}</small>
                  </div>
                )}
                <PhotoImportReport report={photoImportReport} onClose={() => setPhotoImportReport(null)} />

                <div className="photo-library-tabs-v3" role="tablist" aria-label="Фильтр фотографий">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={photoLibraryView === 'unused'}
                    className={photoLibraryView === 'unused' ? 'active' : ''}
                    onClick={() => { setPhotoLibraryView('unused'); setSelectedPhotoId(null); }}
                  >
                    Не использованы <b>{unusedLibraryPhotos.length}</b>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={photoLibraryView === 'used'}
                    className={photoLibraryView === 'used' ? 'active' : ''}
                    onClick={() => { setPhotoLibraryView('used'); setSelectedPhotoId(null); }}
                  >
                    В альбоме <b>{usedLibraryPhotos.length}</b>
                  </button>
                </div>

                <button
                  className="photo-panel-clear-v3"
                  type="button"
                  onClick={clearPhotoLibraryPanel}
                  disabled={visibleLibrary.length === 0 || photoImporting}
                >
                  Очистить список загруженных фото
                </button>
              </div>

              <div className="photo-panel-list-v3">
                {selectedPhoto && <div className="mobile-pick-hint">Выбрано фото. Теперь нажми рамку на странице.</div>}
                {photoLibraryItems.length === 0 ? (
                  <div className="empty-state photo-panel-empty-v3">
                    <p>{photoLibraryView === 'used' ? 'В альбоме пока нет фотографий из этого списка.' : 'Все загруженные фотографии уже используются в альбоме.'}</p>
                  </div>
                ) : (
                  <div className="photo-grid photo-library-grid-v3">
                    {photoLibraryItems.map((photo) => (
                      <button
                        key={photo.id}
                        type="button"
                        className={\`photo-card ${photo.id === selectedPhotoId ? 'selected-photo-card' : ''}\`}
                        draggable
                        onClick={() => { setSelectedPhotoId(photo.id); show(photoLibraryView === 'used' ? 'Фото уже есть в альбоме. Можно вставить ещё раз.' : 'Фото выбрано'); }}
                        onDragStart={(event) => { event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData('photo-id', photo.id); }}
                      >
                        <small className="photo-order-badge-v3">{photoOrderById.get(String(photo.id))}</small>
                        <PhotoLibraryThumbnail photo={photo} />
                        <span className="photo-card-name-v3">{photo.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {leftPanel === 'pages'`;
app = app.replace(photoPanelPattern, photoPanelReplacement);

main = replaceOnce(
  main,
  `import './photo-import-report.css';\nimport './album-flip-preview.css';`,
  `import './photo-import-report.css';\nimport './photo-library-panel.css';\nimport './album-flip-preview.css';`,
  'photo panel stylesheet import',
);

const css = String.raw`/* Compact desktop photo library panel. Keeps controls short and gives thumbnails the remaining height. */
.photo-panel-v3 {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  max-height: calc(100vh - 270px);
  overflow: hidden;
}

.photo-panel-header-v3 {
  flex: 0 0 auto;
  display: grid;
  gap: 6px;
  padding-bottom: 7px;
  border-bottom: 1px solid var(--ui-line, #d2d6d8);
}

.photo-panel-title-v3 {
  min-height: 30px;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
}

.photo-panel-title-v3 h2 {
  margin: 0;
  font-size: 17px;
  line-height: 1.1;
}

.photo-panel-title-v3 p {
  margin: 2px 0 0;
  font-size: 10px;
  line-height: 1.1;
}

.photo-panel-actions-v3 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px;
}

.editor-left-panel-v2 .photo-panel-action-v3 {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 32px;
  margin: 0;
  padding: 5px 7px;
  font-size: 10.5px;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
}

.photo-panel-action-v3 strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.photo-library-tabs-v3 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  margin-top: 1px;
}

.photo-library-tabs-v3 button {
  min-width: 0;
  min-height: 34px;
  border: 1px solid var(--ui-line, #d2d6d8);
  border-radius: 5px;
  background: #fff;
  color: var(--ui-text, #272b2e);
  padding: 5px 4px;
  font: inherit;
  font-size: 10px;
  font-weight: 750;
  line-height: 1.05;
  cursor: pointer;
}

.photo-library-tabs-v3 button b {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  min-height: 18px;
  margin-left: 2px;
  border-radius: 999px;
  background: #eef0f1;
  padding: 0 5px;
  font-size: 10px;
}

.photo-library-tabs-v3 button.active {
  border-color: var(--ui-green, #3e484d);
  background: var(--ui-green-soft, #e3e7e9);
  box-shadow: inset 0 0 0 1px var(--ui-green, #3e484d);
}

.photo-panel-clear-v3 {
  justify-self: start;
  min-height: 20px;
  border: 0;
  background: transparent;
  color: var(--ui-muted, #70767a);
  padding: 0 2px;
  font-size: 9.5px;
  line-height: 1.1;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.photo-panel-clear-v3:disabled {
  opacity: 0.45;
  cursor: default;
}

.photo-panel-list-v3 {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 7px 2px 12px 0;
  scrollbar-gutter: stable;
}

.photo-panel-list-v3 .mobile-pick-hint {
  margin: 0 0 6px;
  padding: 6px 7px;
  font-size: 10px;
  line-height: 1.2;
}

.photo-grid.photo-library-grid-v3 {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-content: start;
  gap: 5px;
  max-height: none !important;
  overflow: visible !important;
  padding: 0;
}

.photo-library-grid-v3 .photo-card {
  position: relative;
  min-width: 0;
  min-height: 0;
  padding: 3px;
}

.photo-library-grid-v3 .photo-thumbnail {
  width: 100%;
  aspect-ratio: 1 / 1;
  min-height: 0;
  border-radius: 3px;
  overflow: hidden;
}

.photo-library-grid-v3 .photo-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.photo-card-name-v3 {
  display: block;
  width: 100%;
  margin-top: 3px;
  overflow: hidden;
  color: var(--ui-muted, #70767a);
  font-size: 8.5px !important;
  line-height: 1.05;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.photo-order-badge-v3 {
  position: absolute;
  z-index: 3;
  top: 5px;
  left: 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
  color: #272b2e;
  padding: 0 4px;
  font-size: 8px;
  font-weight: 850;
  line-height: 1;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
  pointer-events: none;
}

.photo-panel-empty-v3 {
  min-height: 112px;
  margin: 0;
  padding: 14px 10px;
  font-size: 11px;
}

.photo-panel-v3 .photo-upload-progress,
.photo-panel-v3 .photo-import-report {
  margin: 0;
}

@media (max-width: 760px), (max-width: 920px) and (pointer: coarse) and (orientation: landscape) {
  .photo-panel-v3 {
    height: auto;
    max-height: none;
    overflow: visible;
  }

  .photo-panel-list-v3 {
    max-height: 48vh;
    overflow-y: auto;
  }

  .photo-grid.photo-library-grid-v3 {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .editor-left-panel-v2 .photo-panel-action-v3,
  .photo-library-tabs-v3 button {
    min-height: 40px;
    font-size: 11px;
  }
}
`;

const test = String.raw`import { expect, test } from '@playwright/test';
import { openEditor, TINY_PNG_DATA_URL } from './helpers.mjs';

test('photo panel separates unused and album photos while preserving upload order', async ({ page }) => {
  await openEditor(page);

  await page.evaluate(async ({ src }) => {
    const project = structuredClone(window.__collageApp.getProject());
    const photos = [
      { id: 'photo-order-1', name: '01-first.png', src },
      { id: 'photo-order-2', name: '02-second.png', src },
      { id: 'photo-order-3', name: '03-third.png', src },
    ];
    project.library = photos;
    project.pages[0].frames[0].photo = { ...photos[1], zoom: 1, offsetX: 0, offsetY: 0 };
    await window.__collageApp.openProject(project);
  }, { src: TINY_PNG_DATA_URL });

  const panel = page.locator('.photo-panel-v3');
  await expect(panel).toBeVisible();

  const unusedTab = panel.getByRole('tab', { name: /Не использованы/ });
  const usedTab = panel.getByRole('tab', { name: /В альбоме/ });
  await expect(unusedTab).toHaveAttribute('aria-selected', 'true');
  await expect(unusedTab).toContainText('2');
  await expect(usedTab).toContainText('1');

  await expect(panel.locator('.photo-card-name-v3')).toHaveText(['01-first.png', '03-third.png']);
  await expect(panel.locator('.photo-order-badge-v3')).toHaveText(['1', '3']);

  await usedTab.click();
  await expect(usedTab).toHaveAttribute('aria-selected', 'true');
  await expect(panel.locator('.photo-card-name-v3')).toHaveText(['02-second.png']);
  await expect(panel.locator('.photo-order-badge-v3')).toHaveText(['2']);
});

test('photo panel gives the thumbnail list most of its vertical space', async ({ page }) => {
  await page.setViewportSize({ width: 1656, height: 900 });
  await openEditor(page);
  const sizes = await page.locator('.photo-panel-v3').evaluate((panel) => {
    const header = panel.querySelector('.photo-panel-header-v3')?.getBoundingClientRect();
    const list = panel.querySelector('.photo-panel-list-v3')?.getBoundingClientRect();
    return { header: header?.height || 0, list: list?.height || 0 };
  });
  expect(sizes.header).toBeLessThan(190);
  expect(sizes.list).toBeGreaterThan(300);
});
`;

writeFileSync(appPath, app);
writeFileSync(mainPath, main);
writeFileSync(cssPath, css);
writeFileSync(testPath, test);
console.log('Photo library panel patch applied');
