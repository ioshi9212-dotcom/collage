from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


app_path = Path('src/AppLive.jsx')
app = app_path.read_text(encoding='utf-8')

app = replace_once(
    app,
    """  function setMode(mode) {
    const next = normalizeAlbumEditorMode(mode);
    setAlbumMode(next);
    setSelectedFrameId(null);
    setSelectedTextId(null);
    setSelectedDrawingId(null);
  }""",
    """  function setMode(mode) {
    const next = normalizeAlbumEditorMode(mode);
    setAlbumMode(next);
    if (next !== 'collage') setSelectedFrameId(null);
    if (next !== 'text') setSelectedTextId(null);
    if (next !== 'drawings') setSelectedDrawingId(null);
    if (next !== 'collage') setInspectorTab('object');
  }""",
    'mode selection preservation',
)

app = replace_once(
    app,
    """  function addText(presetId = DEFAULT_TEXT_PRESET_ID) {
    const item = createTextItem(presetId);
    updateExtraLayers((layers) => {
      const { next, page } = createPageLayerDraft(layers, activePageNumber());
      page.texts.push(item);
      return next;
    });
    setSelectedFrameId(null);
    setSelectedDrawingId(null);
    setSelectedTextId(item.id);
    setMode('text');
  }""",
    """  function addText(presetId = DEFAULT_TEXT_PRESET_ID) {
    const item = createTextItem(presetId);
    setLeftPanel('text');
    setMode('text');
    updateExtraLayers((layers) => {
      const { next, page } = createPageLayerDraft(layers, activePageNumber());
      page.texts.push(item);
      return next;
    });
    setSelectedFrameId(null);
    setSelectedDrawingId(null);
    setSelectedTextId(item.id);
    setInspectorTab('object');
    show('Текст добавлен. Настройки открыты справа.');
  }""",
    'text insertion flow',
)

app = replace_once(
    app,
    """  function createLineItem() {
    return {
      id: makeId(),
      type: 'line',
      x: Math.round(canvas.width * 0.18),
      y: Math.round(canvas.height * 0.5),
      length: Math.round(canvas.width * 0.48),
      angle: 0,
      strokeWidth: 4,
      color: '#6f6862',
      opacity: 1,
    };
  }

  function addLine() {
    const item = createLineItem();
    updateExtraLayers((layers) => {
      const { next, page } = createPageLayerDraft(layers, activePageNumber());
      page.drawings.push(item);
      return next;
    });
    setSelectedFrameId(null);
    setSelectedTextId(null);
    setSelectedDrawingId(item.id);
    setMode('drawings');
  }""",
    """  function createLineItem(angle = 0) {
    return {
      id: makeId(),
      type: 'line',
      x: Math.round(canvas.width * 0.18),
      y: Math.round(canvas.height * 0.5),
      length: Math.round((angle === 90 ? canvas.height : canvas.width) * 0.48),
      angle,
      strokeWidth: 4,
      color: '#6f6862',
      opacity: 1,
    };
  }

  function addLine(angle = 0) {
    const item = createLineItem(angle);
    setLeftPanel('drawings');
    setMode('drawings');
    updateExtraLayers((layers) => {
      const { next, page } = createPageLayerDraft(layers, activePageNumber());
      page.drawings.push(item);
      return next;
    });
    setSelectedFrameId(null);
    setSelectedTextId(null);
    setSelectedDrawingId(item.id);
    setInspectorTab('object');
    show(angle === 90 ? 'Вертикальная линия добавлена.' : 'Линия добавлена. Настройки открыты справа.');
  }""",
    'line insertion flow',
)

app = replace_once(
    app,
    """    setAlbum((current) => ({ ...current, currentPageId: pageId }));
    setSelectedFrameId(frameId);
    setMoveFrameWithPhotoId((current) => (current && current !== frameId ? null : current));""",
    """    setAlbum((current) => ({ ...current, currentPageId: pageId }));
    setSelectedFrameId(frameId);
    setInspectorTab('object');
    setMoveFrameWithPhotoId((current) => (current && current !== frameId ? null : current));""",
    'frame inspector activation',
)

app = replace_once(
    app,
    """    setSelectedFrameId(null);
    setMoveFrameWithPhotoId(null);
    if (viewMode === 'booklet') {""",
    """    setSelectedFrameId(null);
    setMoveFrameWithPhotoId(null);
    if (albumMode === 'collage') setInspectorTab('page');
    if (viewMode === 'booklet') {""",
    'page inspector activation',
)

app = replace_once(
    app,
    """  function enterBookletMode() {
    const side = findBookletSideForPage(bookletPlan, currentPageIndex + 1) ?? bookletPlan.sides[0];
    setBookletSideId(side?.id ?? null);
    setViewMode('booklet');
    setSelectedFrameId(null);
    setMoveFrameWithPhotoId(null);
  }""",
    """  function enterBookletMode() {
    const side = findBookletSideForPage(bookletPlan, currentPageIndex + 1) ?? bookletPlan.sides[0];
    setBookletSideId(side?.id ?? null);
    setViewMode('booklet');
    setMode('collage');
    setLeftPanel('pages');
    setInspectorTab('page');
    setSelectedFrameId(null);
    setMoveFrameWithPhotoId(null);
  }""",
    'booklet inspector activation',
)

app = replace_once(
    app,
    """          <button className="button full accent" onClick={() => addText('body')}>+ Добавить текст</button>""",
    """          <div className="insert-tool-grid-v3">
            <button className="button full accent" onClick={() => addText('body')}>+ Обычный текст</button>
            <button className="button full" onClick={() => addText('title')}>+ Заголовок</button>
            <button className="button full" onClick={() => addText('signature')}>+ Подпись</button>
          </div>""",
    'text insertion buttons',
)

app = replace_once(
    app,
    """          <button className="button full accent" onClick={addLine}>+ Линия</button>""",
    """          <div className="insert-tool-grid-v3">
            <button className="button full accent" onClick={() => addLine(0)}>+ Горизонтальная линия</button>
            <button className="button full" onClick={() => addLine(90)}>+ Вертикальная линия</button>
          </div>""",
    'drawing insertion buttons',
)

app = replace_once(
    app,
    """          {leftPanel === 'text' && (
            <>
              {renderModeLeftPanel()}
              <button className="button full" onClick={() => addText('title')}>+ Заголовок</button>
              <button className="button full" onClick={() => addText('signature')}>+ Подпись</button>
            </>
          )}""",
    """          {leftPanel === 'text' && renderModeLeftPanel()}""",
    'remove duplicate text buttons',
)

booklet_insert_anchor = """              <div className="panel-title compact"><div><h2>Страница {currentPageIndex + 1}</h2><p>{currentPage?.isBlankPage ? 'Пустая страница' : `${currentPageFrameCount} фото-окон`}</p></div></div>
              <div className="inspector-block">"""
booklet_insert = """              <div className="panel-title compact"><div><h2>{isBooklet ? 'Брошюра' : `Страница ${currentPageIndex + 1}`}</h2><p>{isBooklet ? (currentBookletSide?.title ?? 'Сторона листа A4') : currentPage?.isBlankPage ? 'Пустая страница' : `${currentPageFrameCount} фото-окон`}</p></div></div>
              {isBooklet && (
                <div className="booklet-inspector-v3">
                  <div className="inspector-block">
                    <h3>Настройки брошюры</h3>
                    <label className="field"><span>Листов в блоке</span><select value={bookletSheetsPerBlock} onChange={(event) => updateBookletSheetsPerBlock(event.target.value)}>{[1, 2, 3, 4, 5, 6, 7, 8].map((count) => <option key={count} value={count}>{count} лист. / {count * 4} стр.</option>)}</select></label>
                    <label className="field"><span>Порядок оборотов</span><select aria-label="Порядок оборотов" value={normalizedBookletPrintSettings.backOrder} onChange={(event) => updateBookletPrintSetting('backOrder', event.target.value)}><option value={BOOKLET_BACK_ORDER_REVERSE}>Обратный</option><option value={BOOKLET_BACK_ORDER_SAME}>Такой же</option></select></label>
                    <label className="toggle-row-v3"><input type="checkbox" checked={normalizedBookletPrintSettings.showFoldLine} onChange={(event) => updateBookletPrintSetting('showFoldLine', event.target.checked)} /><span>Печатать линию сгиба</span></label>
                    <label className="toggle-row-v3"><input aria-label="Развернуть обороты на 180°" type="checkbox" checked={normalizedBookletPrintSettings.rotateBack180} onChange={(event) => updateBookletPrintSetting('rotateBack180', event.target.checked)} /><span>Развернуть обороты на 180°</span></label>
                    <label className="field"><span>Толщина бумаги, мм</span><SoftNumberInput min={0.05} max={0.5} step={0.01} value={normalizedBookletPrintSettings.paperThicknessMm} onValue={(value) => updateBookletPrintSetting('paperThicknessMm', value)} /></label>
                  </div>
                  <div className="inspector-block">
                    <h3>Сторона листа</h3>
                    <div className="button-row-v3">
                      <button className="button" onClick={() => goBookletSide(-1)} disabled={!currentBookletSide || bookletPlan.sides[0]?.id === currentBookletSide.id}>←</button>
                      <button className="button" onClick={toggleBookletSheetSide} disabled={!currentBookletSide}>{currentBookletSide?.side === BOOKLET_SIDE_FRONT ? 'Оборот' : 'Лицевая'}</button>
                      <button className="button" onClick={() => goBookletSide(1)} disabled={!currentBookletSide || bookletPlan.sides[bookletPlan.sides.length - 1]?.id === currentBookletSide.id}>→</button>
                    </div>
                    <div className="booklet-summary-card compact-booklet-summary-v3">
                      <span>{bookletExportSummary.blocks} блок. · {bookletExportSummary.sheets} лист. A4 · {bookletExportSummary.sides} сторон</span>
                      <span>A4 горизонтально 297×210 мм · половина листа 148,5×210 мм · {bookletA4Geometry.outputWidthPx}×{bookletA4Geometry.outputHeightPx} px</span>
                      <span>Толщина блока: {bookletBlockThicknessMm} мм</span>
                    </div>
                    {bookletPlan.blankPageCount > 0 && <button className="button full" onClick={addBlankPagesToBookletBlock}>Добавить пустые страницы: {bookletPlan.blankPageCount}</button>}
                    {trailingBlankPageCount > 0 && <button className="button full" onClick={removeTrailingBlankPages}>Убрать пустые в конце</button>}
                  </div>
                  <details className="booklet-export-details-v3">
                    <summary>Экспорт брошюры</summary>
                    <div className="booklet-export-grid-v3">
                      <button className="button" onClick={() => exportBookletPdf('fronts')} disabled={!bookletPlan.sides.length || pdfExporting}>PDF лицевых A4</button>
                      <button className="button" onClick={() => exportBookletPdf('backs')} disabled={!bookletPlan.sides.length || pdfExporting}>PDF оборотов A4</button>
                      <button className="button" onClick={() => exportBookletPdf('combined')} disabled={!bookletPlan.sides.length || pdfExporting}>PDF вся брошюра A4</button>
                      <button className="button" onClick={() => exportBookletPdf('test')} disabled={!bookletPlan.sides.length || pdfExporting}>Тест первого листа</button>
                      <button className="button" onClick={downloadBookletInstructions} disabled={!bookletPlan.sides.length}>Инструкция</button>
                      <button className="button" onClick={() => exportBookletSide()} disabled={!currentBookletSide}>PNG текущей стороны</button>
                      <button className="button" onClick={exportBookletAll} disabled={!bookletPlan.sides.length}>PNG всех сторон</button>
                      <button className="button" onClick={exportBookletZip} disabled={!bookletPlan.sides.length}>Пакет печати ZIP</button>
                    </div>
                  </details>
                </div>
              )}
              {!isBooklet && <div className="inspector-block">"""
app = replace_once(app, booklet_insert_anchor, booklet_insert, 'booklet inspector insertion')

app = replace_once(
    app,
    """              </div>
              <div className="inspector-block">
                <h3>Фон и рамки</h3>""",
    """              </div>}
              {!isBooklet && <div className="inspector-block">
                <h3>Фон и рамки</h3>""",
    'close conditional page layout block',
)

app = replace_once(
    app,
    """                <label className="field"><span>Обводка внутри окна</span><SoftNumberInput min={0} max={80} value={settings.borderWidth} onValue={(value) => updateSetting('borderWidth', value)} /></label>
              </div>
              <details className="print-settings-details-v2">""",
    """                <label className="field"><span>Обводка внутри окна</span><SoftNumberInput min={0} max={80} value={settings.borderWidth} onValue={(value) => updateSetting('borderWidth', value)} /></label>
              </div>}
              {!isBooklet && <details className="print-settings-details-v2">""",
    'conditional print settings start',
)

app = replace_once(
    app,
    """                  <div className="print-summary"><strong>Печать:</strong> {formatPrintSummary(pagePrintGeometry)} · вылет по {normalizedPrintSettings.bleedMm} мм · safe zone {normalizedPrintSettings.safeMm} мм</div>
                </div>
              </details>""",
    """                  <div className="print-summary"><strong>Печать:</strong> {formatPrintSummary(pagePrintGeometry)} · вылет по {normalizedPrintSettings.bleedMm} мм · safe zone {normalizedPrintSettings.safeMm} мм</div>
                </div>
              </details>}""",
    'conditional print settings end',
)

app_path.write_text(app, encoding='utf-8')

css_path = Path('src/editor-shell-v2.css')
css = css_path.read_text(encoding='utf-8')
css += """

/* shell v3: fixed editor viewport and functional creation tools */
html,
body,
#root {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

body { margin: 0; }

.app-shell {
  height: 100vh;
  min-height: 0;
  overflow: hidden;
}

.album-bar,
.album-bar.clean-control-panel,
.album-tool-panel,
.react-mode-panel {
  display: none !important;
}

.editor-workspace-v2 {
  flex: 1 1 auto;
  height: auto;
  min-height: 0;
  grid-template-rows: minmax(0, 1fr) 96px;
}

.editor-left-panel-v2,
.workspace > .sidebar,
.workspace > .inspector,
.workspace > .album-mode-inspector,
.canvas-area {
  min-height: 0;
}

.page-rail {
  min-height: 96px;
  max-height: 96px !important;
  padding-block: 6px;
}

.page-rail-card {
  min-height: 76px;
  height: 76px;
}

body[data-album-mode='text'] .editor-workspace-v2 > .inspector,
body[data-album-mode='drawings'] .editor-workspace-v2 > .inspector,
body[data-album-mode='templates'] .editor-workspace-v2 > .inspector {
  display: none !important;
}

body[data-album-mode='text'] .editor-workspace-v2 > .album-mode-inspector,
body[data-album-mode='drawings'] .editor-workspace-v2 > .album-mode-inspector,
body[data-album-mode='templates'] .editor-workspace-v2 > .album-mode-inspector {
  display: block !important;
  grid-area: inspector;
}

.insert-tool-grid-v3,
.booklet-export-grid-v3 {
  display: grid;
  gap: 7px;
}

.insert-tool-grid-v3 {
  grid-template-columns: 1fr;
  margin-bottom: 10px;
}

.booklet-inspector-v3 {
  display: grid;
  gap: 12px;
}

.toggle-row-v3 {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  color: var(--shell-text);
  font-size: 11.5px;
  font-weight: 700;
}

.button-row-v3 {
  display: grid;
  grid-template-columns: 42px 1fr 42px;
  gap: 6px;
}

.compact-booklet-summary-v3 {
  display: grid;
  gap: 5px;
  margin-top: 9px;
  border: 1px solid var(--shell-line);
  background: #fff;
  padding: 9px;
  color: var(--shell-muted);
  font-size: 10.5px;
  line-height: 1.35;
}

.booklet-export-details-v3 {
  border-top: 1px solid var(--shell-line);
  padding-top: 9px;
}

.booklet-export-details-v3 > summary {
  cursor: pointer;
  font-size: 12px;
  font-weight: 900;
  list-style: none;
}

.booklet-export-details-v3 > summary::-webkit-details-marker { display: none; }
.booklet-export-details-v3 > summary::after { content: '▾'; float: right; color: var(--shell-muted); }
.booklet-export-details-v3[open] > summary::after { content: '▴'; }
.booklet-export-grid-v3 { margin-top: 9px; }

.editor-tool-button-v2 {
  font-size: 10px;
}

.editor-left-panel-v2 .panel-title h2,
.workspace > .album-mode-inspector .panel-title h2,
.workspace > .inspector .panel-title h2 {
  font-size: 16px;
}

.editor-left-panel-v2 .panel-title p,
.workspace > .album-mode-inspector .panel-title p,
.workspace > .inspector .panel-title p,
.field > span {
  font-size: 11px;
}

.photo-used-badge {
  top: 4px !important;
  right: 4px !important;
  left: auto !important;
  width: auto !important;
  max-width: calc(100% - 8px);
  padding: 2px 5px !important;
  border-radius: 3px !important;
  font-size: 8px !important;
  line-height: 1.1;
}
"""
css_path.write_text(css, encoding='utf-8')

booklet_test_path = Path('e2e/booklet-print.spec.js')
booklet_test = booklet_test_path.read_text(encoding='utf-8')
booklet_test = replace_once(
    booklet_test,
    """  await page.getByRole('button', { name: 'Брошюра' }).click();
  await expect(page.getByRole('button', { name: 'PDF лицевых A4' })).toBeVisible();""",
    """  await page.getByRole('button', { name: 'Брошюра' }).click();
  await expect(page.getByText('Настройки брошюры', { exact: true })).toBeVisible();
  await page.locator('.booklet-export-details-v3 > summary').click();
  await expect(page.getByRole('button', { name: 'PDF лицевых A4' })).toBeVisible();""",
    'booklet test opens compact export section',
)
booklet_test_path.write_text(booklet_test, encoding='utf-8')

shell_test_path = Path('e2e/editor-shell-v3.spec.js')
shell_test_path.write_text("""import { expect, test } from '@playwright/test';

async function openEditor(page) {
  await page.setViewportSize({ width: 1640, height: 900 });
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__collageApp?.getProject === 'function');
}

test.describe('editor shell v3', () => {
  test('editor is fixed to the viewport and old top controls are removed', async ({ page }) => {
    await openEditor(page);
    await expect(page.locator('.app-header-v2')).toBeVisible();
    await expect(page.locator('.album-bar')).toBeHidden();
    await expect.poll(() => page.evaluate(() => ({
      bodyOverflow: getComputedStyle(document.body).overflow,
      rootHeight: document.querySelector('.app-shell')?.getBoundingClientRect().height,
      viewport: window.innerHeight,
      pageBottom: document.querySelector('.page-rail')?.getBoundingClientRect().bottom,
    }))).toMatchObject({ bodyOverflow: 'hidden', rootHeight: 900, viewport: 900, pageBottom: 900 });
  });

  test('text tools insert and immediately select editable text', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Текст', exact: true }).click();
    await expect(page.getByRole('button', { name: '+ Обычный текст' })).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Заголовок' })).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Подпись' })).toBeVisible();
    await page.getByRole('button', { name: '+ Обычный текст' }).click();
    await expect.poll(() => page.evaluate(() => window.__collageApp.getProject().extraLayers?.pages?.['1']?.texts?.length || 0)).toBe(1);
    await expect(page.getByText('Настройки текста', { exact: true })).toBeVisible();
    await expect(page.locator('.album-mode-inspector textarea')).toHaveValue('Новый текст');
  });

  test('drawing tools insert horizontal and vertical lines with live inspector', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Рисунки', exact: true }).click();
    await expect(page.getByRole('button', { name: '+ Горизонтальная линия' })).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Вертикальная линия' })).toBeVisible();
    await page.getByRole('button', { name: '+ Горизонтальная линия' }).click();
    await expect.poll(() => page.evaluate(() => window.__collageApp.getProject().extraLayers?.pages?.['1']?.drawings?.[0]?.angle)).toBe(0);
    await expect(page.getByText('Настройки линии', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '+ Вертикальная линия' }).click();
    await expect.poll(() => page.evaluate(() => window.__collageApp.getProject().extraLayers?.pages?.['1']?.drawings?.[1]?.angle)).toBe(90);
  });

  test('booklet settings live in the page inspector instead of the old top stack', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Брошюра', exact: true }).click();
    await expect(page.locator('.inspector-tab-v2[data-tab="page"]')).toHaveClass(/active/);
    await expect(page.getByText('Настройки брошюры', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Листов в блоке')).toBeVisible();
    await expect(page.locator('.booklet-summary-card')).toContainText('A4 горизонтально 297×210 мм');
  });
});
""", encoding='utf-8')

print('editor shell v3 patch applied')
