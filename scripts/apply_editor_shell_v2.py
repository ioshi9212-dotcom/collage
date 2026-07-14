from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


app_path = Path('src/AppLive.jsx')
app = app_path.read_text(encoding='utf-8')

app = replace_once(
    app,
    "  const [previewViewport, setPreviewViewport] = useState({ width: 1220, height: 720 });",
    "  const [previewViewport, setPreviewViewport] = useState({ width: 1220, height: 720 });\n  const [exportMenuOpen, setExportMenuOpen] = useState(false);\n  const [leftPanel, setLeftPanel] = useState('photos');\n  const [inspectorTab, setInspectorTab] = useState('object');",
    'editor shell state',
)

header_pattern = re.compile(r'      <header className="topbar app-topbar">.*?      </header>', re.S)
header = '''      <header className="app-header-v2">
        <div className="app-brand-v2">
          <span className="app-brand-mark-v2">CC</span>
          <div className="app-brand-copy-v2">
            <strong>Collage Creator</strong>
            <span>{isBooklet ? (currentBookletSide?.title ?? 'Брошюра') : isSpread ? `Разворот ${spreadStart + 1}–${Math.min(spreadStart + 2, pages.length)}` : `Страница ${currentPageIndex + 1} из ${pages.length}`}</span>
          </div>
        </div>

        <div className="app-view-switch-v2">
          <div className="segmented-v2" aria-label="Режим просмотра">
            <button type="button" className={viewMode === 'single' ? 'active' : ''} onClick={() => setViewMode('single')}>Страница</button>
            <button type="button" className={viewMode === 'spread' ? 'active' : ''} onClick={() => setViewMode('spread')}>Разворот</button>
            <button type="button" className={isBooklet ? 'active' : ''} onClick={enterBookletMode}>Брошюра</button>
          </div>
        </div>

        <div className="app-header-actions-v2">
          <button className="button" type="button" onClick={loadSaved}>Открыть</button>
          <div className="export-menu-v2">
            <button className="button" type="button" aria-expanded={exportMenuOpen} onClick={() => setExportMenuOpen((open) => !open)}>Экспорт ▾</button>
            {exportMenuOpen && (
              <div className="export-popover-v2" role="menu">
                <button className="button" type="button" disabled={pdfExporting} onClick={() => { setExportMenuOpen(false); exportPng(printPageRef, `collage-page-${pad(currentPageIndex + 1)}.png`, 'Скачана страница', pagePrintGeometry); }}>PNG страницы</button>
                <button className="button" type="button" disabled={pdfExporting} onClick={() => { setExportMenuOpen(false); exportPng(printSpreadRef, `collage-spread-${pad(spreadStart + 1)}-${pad(Math.min(spreadStart + 2, pages.length))}.png`, 'Скачан разворот', spreadPrintGeometry); }}>PNG разворота</button>
                <button className="button" type="button" disabled={pdfExporting} onClick={() => { setExportMenuOpen(false); exportPdf(printPageRef, `collage-page-${pad(currentPageIndex + 1)}.pdf`, 'PDF страницы', pagePrintGeometry); }}>PDF страницы</button>
                <button className="button" type="button" disabled={pdfExporting} onClick={() => { setExportMenuOpen(false); exportPdf(printSpreadRef, `collage-spread-${pad(spreadStart + 1)}-${pad(Math.min(spreadStart + 2, pages.length))}.pdf`, 'PDF разворота', spreadPrintGeometry); }}>PDF разворота</button>
                <button className="button" type="button" disabled={pdfExporting} onClick={() => { setExportMenuOpen(false); exportAlbumPdf(); }}>{pdfExporting ? 'Готовлю PDF…' : 'PDF альбома'}</button>
                <div className="menu-section-v2">Проект</div>
                <button className="button" type="button" onClick={() => { setExportMenuOpen(false); downloadProjectJson(); }}>Скачать JSON</button>
                <button className="button" type="button" onClick={() => { setExportMenuOpen(false); jsonRef.current?.click(); }}>Загрузить JSON</button>
                <input ref={jsonRef} className="hidden-input" type="file" accept="application/json" onChange={importJson} />
              </div>
            )}
          </div>
          <button className="button primary-save-v2" type="button" onClick={save}>Сохранить</button>
          <button className="button" type="button" onClick={() => document.querySelector('.cloud-auth-toggle')?.click()}>Аккаунт</button>
        </div>
      </header>'''
app, count = header_pattern.subn(header, app, count=1)
if count != 1:
    raise SystemExit(f'header: expected one match, found {count}')

app = replace_once(
    app,
    '      <section className="workspace three-columns">',
    '''      <section className="workspace editor-workspace-v2">
        <nav className="editor-tool-rail-v2" aria-label="Инструменты редактора">
          <button type="button" className={`editor-tool-button-v2 ${leftPanel === 'photos' ? 'active' : ''}`} onClick={() => { setLeftPanel('photos'); setMode('collage'); }}><b>▧</b><span>Фото</span></button>
          <button type="button" className={`editor-tool-button-v2 ${leftPanel === 'pages' ? 'active' : ''}`} onClick={() => { setLeftPanel('pages'); setMode('collage'); }}><b>▤</b><span>Страницы</span></button>
          <button type="button" className={`editor-tool-button-v2 ${leftPanel === 'collage' ? 'active' : ''}`} onClick={() => { setLeftPanel('collage'); setMode('collage'); }}><b>▦</b><span>Коллаж</span></button>
          <button type="button" className={`editor-tool-button-v2 ${leftPanel === 'text' ? 'active' : ''}`} onClick={() => { setLeftPanel('text'); setMode('text'); }}><b>T</b><span>Текст</span></button>
          <button type="button" className={`editor-tool-button-v2 ${leftPanel === 'drawings' ? 'active' : ''}`} onClick={() => { setLeftPanel('drawings'); setMode('drawings'); }}><b>╱</b><span>Рисунки</span></button>
          <button type="button" className={`editor-tool-button-v2 ${leftPanel === 'templates' ? 'active' : ''}`} onClick={() => { setLeftPanel('templates'); setMode('templates'); }}><b>◇</b><span>Шаблоны</span></button>
        </nav>''',
    'workspace opening',
)

sidebar_pattern = re.compile(r'        <aside className="sidebar">.*?        </aside>', re.S)
sidebar = '''        <aside className="sidebar editor-left-panel-v2">
          {leftPanel === 'photos' && (
            <>
              <div className="panel-title"><div><h2>Фото</h2><p>Перетащи фото на рамку или выбери фото, затем нажми рамку.</p></div><span>{library.length}</span></div>
              <label className={`upload-box ${photoImporting ? 'disabled-upload-box' : ''}`}><strong>{photoImporting ? 'Загружаю фото…' : 'Загрузить фото'}</strong><small>{photoImporting ? 'Оригиналы сохраняются по очереди' : 'Можно сразу несколько'}</small><input type="file" accept="image/*" multiple disabled={photoImporting} onChange={uploadPhotos} /></label>
              <button className="button full" onClick={() => { setLibrary([]); setSelectedPhotoId(null); show('Список фото очищен'); }} disabled={library.length === 0 || photoImporting}>Очистить список фото</button>
              {selectedPhoto && <div className="mobile-pick-hint">Выбрано фото. Теперь нажми рамку на странице.</div>}
              {library.length === 0 ? <div className="empty-state"><p>Пока фото нет. Нажми “Загрузить фото”.</p></div> : <div className="photo-grid">{library.map((photo) => {
                const isUsed = usedPhotoIds.has(photo.id);
                return (
                  <button key={photo.id} type="button" className={`photo-card ${photo.id === selectedPhotoId ? 'selected-photo-card' : ''} ${isUsed ? 'used-photo-card' : ''}`} draggable onClick={() => { setSelectedPhotoId(photo.id); show(isUsed ? 'Фото уже есть в альбоме. Можно вставить ещё раз.' : 'Фото выбрано'); }} onDragStart={(event) => { event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData('photo-id', photo.id); }}>
                    <PhotoLibraryThumbnail photo={photo} />
                    {isUsed && <small className="photo-used-badge">В альбоме</small>}
                    <span>{photo.name}</span>
                  </button>
                );
              })}</div>}
            </>
          )}

          {leftPanel === 'pages' && (
            <>
              <div className="panel-title compact"><div><h2>Страницы</h2><p>Добавление, копирование и режим просмотра.</p></div><span>{pages.length}</span></div>
              <button className="button full" onClick={addPage}>+ Страница</button>
              <button className="button full" onClick={addBlankPage}>+ Пустая страница</button>
              <button className="button full" onClick={duplicatePage}>Сделать копию</button>
              <button className="button full danger-button" onClick={deletePage}>Удалить страницу</button>
              <div className="inspector-block">
                <h3>Просмотр</h3>
                <button className={`button full ${viewMode === 'single' ? 'active-mode' : ''}`} onClick={() => setViewMode('single')}>Страница</button>
                <button className={`button full ${viewMode === 'spread' ? 'active-mode' : ''}`} onClick={() => setViewMode('spread')}>Разворот</button>
                <button className={`button full ${isBooklet ? 'active-mode' : ''}`} onClick={enterBookletMode}>Брошюра</button>
              </div>
            </>
          )}

          {leftPanel === 'collage' && (
            <>
              <div className="panel-title compact"><div><h2>Коллаж</h2><p>Сетка и размеры фото-окон текущей страницы.</p></div></div>
              <label className="field"><span>Фото-окон</span><select value={currentPage?.isBlankPage ? 0 : currentPageFrameCount} disabled={Boolean(currentPage?.isBlankPage)} onChange={(event) => updateSetting('frameCount', Number(event.target.value))}>{currentPage?.isBlankPage ? <option value={0}>пустая</option> : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((count) => <option key={count} value={count}>{count === 0 ? 'нет' : count}</option>)}</select></label>
              <label className="field"><span>Зазор</span><SoftNumberInput min={0} max={200} value={settings.gap} onValue={(value) => updateSetting('gap', value)} /></label>
              <label className="field"><span>Поля макета</span><SoftNumberInput min={0} max={300} value={settings.padding} onValue={(value) => updateSetting('padding', value)} /></label>
              <button className={`button full ${locked ? 'active-mode' : ''}`} onClick={() => updateSetting('frameMode', locked ? 'free' : 'locked')}>{locked ? 'Сетка окон включена' : 'Свободные окна'}</button>
              <button className="button full" onClick={() => rebuildPage(album.currentPageId, canvas, settings)}>Перестроить рамки</button>
              <button className="button full" onClick={() => { updatePageFrames(album.currentPageId, (frames) => clearAllFramePhotos(frames)); setSelectedFrameId(null); setMoveFrameWithPhotoId(null); }}>Очистить фото</button>
              <div className="inspector-block">
                <h3>Шаблон</h3>
                <button className="button full" onClick={() => saveTemplate('page')}>Сохранить страницу</button>
                <button className="button full" onClick={() => saveTemplate('spread')}>Сохранить разворот</button>
                <button className="button full" onClick={() => saveTemplate('album')}>Сохранить альбом</button>
              </div>
            </>
          )}

          {leftPanel === 'text' && (
            <>
              {renderModeLeftPanel()}
              <button className="button full" onClick={() => addText('title')}>+ Заголовок</button>
              <button className="button full" onClick={() => addText('signature')}>+ Подпись</button>
            </>
          )}
          {leftPanel === 'drawings' && renderModeLeftPanel()}
          {leftPanel === 'templates' && (
            <>
              {renderModeLeftPanel()}
              <button className="button full" onClick={() => saveTemplate('album')}>Сохранить альбом как шаблон</button>
              <button className="button full" onClick={() => templateJsonRef.current?.click()}>Загрузить шаблон JSON</button>
            </>
          )}
        </aside>'''
app, count = sidebar_pattern.subn(sidebar, app, count=1)
if count != 1:
    raise SystemExit(f'sidebar: expected one match, found {count}')

inspector_pattern = re.compile(r'        <aside className="inspector">.*?        </aside>\n      </section>', re.S)
inspector = '''        <aside className="inspector">
          <div className="inspector-tabs-v2">
            <button type="button" data-tab="object" className={`inspector-tab-v2 ${inspectorTab === 'object' ? 'active' : ''}`} onClick={() => setInspectorTab('object')}>Объект</button>
            <button type="button" data-tab="page" className={`inspector-tab-v2 ${inspectorTab === 'page' ? 'active' : ''}`} onClick={() => setInspectorTab('page')}>Страница</button>
          </div>

          {inspectorTab === 'object' ? (
            <>
              <div className="panel-title compact"><div><h2>Настройки окна</h2><p>{selectedFrame ? (locked ? 'В сетке двигай разделители между окнами.' : 'Двигай рамку и фото мышкой.') : 'Выбери рамку на холсте'}</p></div></div>
              <div className="inspector-block"><h3>Цвет и рамка</h3><label className="field color-field"><span>Цвет фона / рамки</span><input type="color" value={settings.borderColor} onChange={(event) => updateSetting('borderColor', event.target.value)} /></label><label className="field"><span>Обводка внутри окна</span><SoftNumberInput min={0} max={80} value={settings.borderWidth} onValue={(value) => updateSetting('borderWidth', value)} /></label></div>
              {selectedFrame ? (
                <>
                  <div className="inspector-block">
                    <h3>Положение рамки</h3>
                    <div className="geometry-grid">
                      <label className="field"><span>X</span><SoftNumberInput min={0} max={Math.max(0, canvas.width - selectedFrame.width)} value={selectedFrame.x} onValue={(value) => changeFrame(album.currentPageId, selectedFrame.id, { x: value })} /></label>
                      <label className="field"><span>Y</span><SoftNumberInput min={0} max={Math.max(0, canvas.height - selectedFrame.height)} value={selectedFrame.y} onValue={(value) => changeFrame(album.currentPageId, selectedFrame.id, { y: value })} /></label>
                      <label className="field"><span>Ширина</span><SoftNumberInput min={MIN_FRAME} max={canvas.width} value={selectedFrame.width} onValue={(value) => changeFrame(album.currentPageId, selectedFrame.id, { width: value })} /></label>
                      <label className="field"><span>Высота</span><SoftNumberInput min={MIN_FRAME} max={canvas.height} value={selectedFrame.height} onValue={(value) => changeFrame(album.currentPageId, selectedFrame.id, { height: value })} /></label>
                    </div>
                    {!locked && <button className="button full" onClick={bringSelectedFrameToFront}>Поверх остальных</button>}
                    {!locked && <button className={`button full ${moveFrameWithPhotoId === selectedFrame.id ? 'accent' : ''}`} onClick={enableMoveFrameWithPhoto} disabled={!selectedFrame.photo}>{moveFrameWithPhotoId === selectedFrame.id ? 'Перетащи рамку сейчас' : 'Двигать рамку с фото'}</button>}
                    <button className="button full danger-button" onClick={deleteSelectedFrame} disabled={currentPageFrameCount <= 0}>Удалить окно</button>
                  </div>
                  <div className="inspector-block">
                    <h3>Фото внутри окна</h3>
                    {selectedFrame.photo ? (
                      <>
                        <p className="photo-name">{selectedFrame.photo.name}</p>
                        <label className="range-row"><span>Масштаб</span><input type="range" min="1" max="3" step="0.01" value={selectedFrame.photo.zoom} onChange={(event) => updatePhoto(album.currentPageId, selectedFrame.id, { zoom: Number(event.target.value) })} /><b>{selectedFrame.photo.zoom.toFixed(2)}</b></label>
                        <button className="button full" onClick={() => updatePhoto(album.currentPageId, selectedFrame.id, { zoom: 1, offsetX: 0, offsetY: 0 })}>Центрировать фото</button>
                        <button className="button full danger-button" onClick={() => updatePageFrames(album.currentPageId, (frames) => clearFramePhoto(frames, selectedFrame.id))}>Убрать фото из окна</button>
                      </>
                    ) : <p className="hint">Нажми фото слева, потом нажми эту рамку.</p>}
                  </div>
                </>
              ) : <div className="empty-state small-empty"><p>Выбери окно коллажа. Для настроек всей страницы открой вкладку «Страница».</p></div>}
            </>
          ) : (
            <div className="page-settings-panel-v2">
              <div className="panel-title compact"><div><h2>Страница {currentPageIndex + 1}</h2><p>{currentPage?.isBlankPage ? 'Пустая страница' : `${currentPageFrameCount} фото-окон`}</p></div></div>
              <div className="inspector-block">
                <h3>Макет страницы</h3>
                <label className="field"><span>Фото-окон</span><select value={currentPage?.isBlankPage ? 0 : currentPageFrameCount} disabled={Boolean(currentPage?.isBlankPage)} onChange={(event) => updateSetting('frameCount', Number(event.target.value))}>{currentPage?.isBlankPage ? <option value={0}>пустая</option> : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((count) => <option key={count} value={count}>{count === 0 ? 'нет' : count}</option>)}</select></label>
                <label className="field"><span>Зазор</span><SoftNumberInput min={0} max={200} value={settings.gap} onValue={(value) => updateSetting('gap', value)} /></label>
                <label className="field"><span>Поля макета</span><SoftNumberInput min={0} max={300} value={settings.padding} onValue={(value) => updateSetting('padding', value)} /></label>
                <button className={`button full ${settings.showGuides ? 'active-mode' : ''}`} onClick={() => updateSetting('showGuides', !settings.showGuides)}>Направляющие</button>
                <button className={`button full ${locked ? 'active-mode' : ''}`} onClick={() => updateSetting('frameMode', locked ? 'free' : 'locked')}>Сетка окон</button>
              </div>
              <div className="inspector-block">
                <h3>Фон и рамки</h3>
                <label className="field color-field"><span>Цвет фона / рамки</span><input type="color" value={settings.borderColor} onChange={(event) => updateSetting('borderColor', event.target.value)} /></label>
                <label className="field"><span>Обводка внутри окна</span><SoftNumberInput min={0} max={80} value={settings.borderWidth} onValue={(value) => updateSetting('borderWidth', value)} /></label>
              </div>
              <details className="print-settings-details-v2">
                <summary>Размер и печать</summary>
                <div className="document-grid">
                  <label className="field wide-field"><span>Размер страницы</span><select value={settings.presetId} onChange={(event) => applyDocumentPreset(event.target.value)}>{PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select></label>
                  <label className="field"><span>Ширина мм</span><SoftNumberInput min={10} max={1000} step={0.1} value={normalizedPrintSettings.trimWidthMm} onValue={(value) => updatePhysicalSize('trimWidthMm', value)} /></label>
                  <label className="field"><span>Высота мм</span><SoftNumberInput min={10} max={1000} step={0.1} value={normalizedPrintSettings.trimHeightMm} onValue={(value) => updatePhysicalSize('trimHeightMm', value)} /></label>
                  <label className="field"><span>DPI</span><select value={normalizedPrintSettings.printDpi} onChange={(event) => updateSetting('printDpi', Number(event.target.value))}>{[150, 254, 300, 600].map((dpi) => <option key={dpi} value={dpi}>{dpi}</option>)}</select></label>
                  <label className="field"><span>Вылет мм</span><SoftNumberInput min={0} max={30} step={0.5} value={normalizedPrintSettings.bleedMm} onValue={(value) => updateSetting('bleedMm', value)} /></label>
                  <label className="field"><span>Безопасно мм</span><SoftNumberInput min={0} max={100} step={0.5} value={normalizedPrintSettings.safeMm} onValue={(value) => updateSetting('safeMm', value)} /></label>
                  <label className="field"><span>Макет шир. px</span><SoftNumberInput min={300} max={5000} value={canvas.width} onValue={(value) => updateCanvas(value, canvas.height, 'custom')} /></label>
                  <label className="field"><span>Макет выс. px</span><SoftNumberInput min={300} max={5000} value={canvas.height} onValue={(value) => updateCanvas(canvas.width, value, 'custom')} /></label>
                  <div className="print-summary"><strong>Печать:</strong> {formatPrintSummary(pagePrintGeometry)} · вылет по {normalizedPrintSettings.bleedMm} мм · safe zone {normalizedPrintSettings.safeMm} мм</div>
                </div>
              </details>
            </div>
          )}
        </aside>
      </section>'''
app, count = inspector_pattern.subn(inspector, app, count=1)
if count != 1:
    raise SystemExit(f'inspector: expected one match, found {count}')

app_path.write_text(app, encoding='utf-8')

main_path = Path('src/main.jsx')
main = main_path.read_text(encoding='utf-8')
main = replace_once(
    main,
    "import './editor-shell-v1-compat.css';",
    "import './editor-shell-v1-compat.css';\nimport './editor-shell-v2.css';",
    'main stylesheet import',
)
main_path.write_text(main, encoding='utf-8')

spec_path = Path('e2e/print-geometry.spec.js')
spec = spec_path.read_text(encoding='utf-8')
spec = replace_once(
    spec,
    "  await expect(page.getByRole('button', { name: 'PNG страницы' })).toBeVisible();",
    "  await expect(page.getByRole('button', { name: 'Экспорт ▾' })).toBeVisible();",
    'print e2e ready assertion',
)
spec = replace_once(
    spec,
    "  await page.getByRole('button', { name: buttonName }).click();",
    "  await page.getByRole('button', { name: 'Экспорт ▾' }).click();\n  await page.getByRole('button', { name: buttonName }).click();",
    'PNG menu opening',
)
spec = replace_once(
    spec,
    "  await page.getByRole('button', { name: buttonName }).click();",
    "  await page.getByRole('button', { name: 'Экспорт ▾' }).click();\n  await page.getByRole('button', { name: buttonName }).click();",
    'PDF menu opening',
)
spec = replace_once(
    spec,
    "    await page.getByLabel('DPI').selectOption('254');",
    "    await page.locator('.inspector-tab-v2[data-tab=\"page\"]').click();\n    await page.locator('.print-settings-details-v2 > summary').click();\n    await page.getByLabel('DPI').selectOption('254');",
    'print settings opening',
)
spec_path.write_text(spec, encoding='utf-8')

print('editor shell v2 patch applied')
