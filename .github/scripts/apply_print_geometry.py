from pathlib import Path

APP = Path('src/AppLive.jsx')
CSS = Path('src/styles.css')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, got {count}')
    return text.replace(old, new, 1)


app = APP.read_text(encoding='utf-8')

app = replace_once(
    app,
    """import {
  MAX_TEMPLATE_RECORDS,
  sanitizeTemplateRecord,
  sanitizeTemplateRecords,
  templateJsonFileError,
} from './editor/templateRecords';
""",
    """import {
  MAX_TEMPLATE_RECORDS,
  sanitizeTemplateRecord,
  sanitizeTemplateRecords,
  templateJsonFileError,
} from './editor/templateRecords';
import {
  DEFAULT_BLEED_MM,
  DEFAULT_PRINT_DPI,
  DEFAULT_SAFE_MM,
  PRINT_ONLY_SETTING_KEYS,
  PRINT_PRESETS,
  composePrintRaster,
  estimateEffectiveDpi,
  formatPrintSummary,
  getBookletPixelRatio,
  getPrintGuideGeometry,
  getPrintPixelGeometry,
  normalizePrintSettings,
  settingsForPrintPreset,
} from './editor/printGeometry';
""",
    'print geometry import',
)

app = replace_once(
    app,
    """const SPREAD_GAP = 90;
const EXPORT_RATIO = 2;
const HANDLE = 28;
const DEFAULT_CANVAS = { width: 1480, height: 2100 };
const DEFAULT_SETTINGS = {
  presetId: 'a5-portrait',
  frameCount: 5,
  padding: 70,
  gap: 28,
  borderWidth: 0,
  borderColor: '#ffffff',
  showGuides: true,
  frameMode: 'free',
};
""",
    """const SPREAD_GAP = 90;
const HANDLE = 28;
const DEFAULT_CANVAS = { width: 1480, height: 2100 };
const DEFAULT_SETTINGS = {
  presetId: 'a5-portrait',
  frameCount: 5,
  padding: 70,
  gap: 28,
  borderWidth: 0,
  borderColor: '#ffffff',
  showGuides: true,
  frameMode: 'free',
  printDpi: DEFAULT_PRINT_DPI,
  bleedMm: DEFAULT_BLEED_MM,
  safeMm: DEFAULT_SAFE_MM,
};
""",
    'default print settings',
)

app = replace_once(
    app,
    """const PRESETS = [
  { id: 'a5-portrait', label: 'A5 вертикальный', width: 1480, height: 2100 },
  { id: 'a5-landscape', label: 'A5 горизонтальный', width: 2100, height: 1480 },
  { id: 'a4-portrait', label: 'A4 вертикальный', width: 2100, height: 2970 },
  { id: 'square', label: 'Квадрат', width: 2000, height: 2000 },
  { id: 'draft', label: 'Черновик', width: 1000, height: 700 },
  { id: 'custom', label: 'Свой размер', width: 1480, height: 2100 },
];
""",
    """const PRESETS = PRINT_PRESETS;
""",
    'print presets',
)

app = replace_once(
    app,
    """    <KonvaImage
      image={image}
      x={rect.x}
""",
    """    <KonvaImage
      name="print-photo"
      photoName={frame.photo?.name || 'Фото'}
      image={image}
      x={rect.x}
""",
    'print photo metadata',
)

old_guides_start = app.index('function PageVisualGuides(')
old_guides_end = app.index('\nfunction PageLayer(', old_guides_start)
new_guides = """function PageVisualGuides({ canvas, layoutInset, printGuide, locked, pageIndex, active }) {
  const pageColor = locked ? '#2f7d52' : '#c27b4f';
  const centerColor = '#2f7d52';
  const quarters = [0.25, 0.75];

  return (
    <>
      <Rect
        x={0}
        y={0}
        width={canvas.width}
        height={canvas.height}
        stroke={pageColor}
        strokeWidth={2}
        strokeScaleEnabled={false}
        dash={[18, 14]}
        opacity={0.42}
        listening={false}
      />
      {layoutInset > 0 && (
        <Rect
          x={layoutInset}
          y={layoutInset}
          width={Math.max(0, canvas.width - layoutInset * 2)}
          height={Math.max(0, canvas.height - layoutInset * 2)}
          stroke={pageColor}
          strokeWidth={1.5}
          strokeScaleEnabled={false}
          dash={[12, 12]}
          opacity={0.22}
          listening={false}
        />
      )}
      <Rect
        x={printGuide.safeInsetX}
        y={printGuide.safeInsetY}
        width={printGuide.safeWidth}
        height={printGuide.safeHeight}
        stroke="#2f7d52"
        strokeWidth={2.5}
        strokeScaleEnabled={false}
        dash={[22, 14]}
        opacity={0.48}
        listening={false}
      />
      {quarters.map((part) => (
        <Group key={`quarter-${part}`} listening={false} opacity={0.08}>
          <Line points={[canvas.width * part, 0, canvas.width * part, canvas.height]} stroke={centerColor} strokeWidth={1} strokeScaleEnabled={false} dash={[10, 14]} listening={false} />
          <Line points={[0, canvas.height * part, canvas.width, canvas.height * part]} stroke={centerColor} strokeWidth={1} strokeScaleEnabled={false} dash={[10, 14]} listening={false} />
        </Group>
      ))}
      <Line points={[canvas.width / 2, 0, canvas.width / 2, canvas.height]} stroke={centerColor} strokeWidth={1.5} strokeScaleEnabled={false} opacity={0.22} listening={false} />
      <Line points={[0, canvas.height / 2, canvas.width, canvas.height / 2]} stroke={centerColor} strokeWidth={1.5} strokeScaleEnabled={false} opacity={0.22} listening={false} />
      <Text
        x={28}
        y={24}
        text={`Стр. ${pageIndex + 1}`}
        fontSize={34}
        fill={active ? pageColor : '#b49a87'}
        fontStyle="bold"
        opacity={0.82}
        listening={false}
      />
      <Text
        x={28}
        y={canvas.height - 54}
        text={`Безопасная зона ${printGuide.safeMm} мм · вылет ${printGuide.bleedMm} мм добавится к PNG`}
        fontSize={22}
        fill="#2f7d52"
        opacity={0.64}
        listening={false}
      />
    </>
  );
}
"""
app = app[:old_guides_start] + new_guides + app[old_guides_end:]

app = replace_once(
    app,
    """  const locked = settings.frameMode === 'locked';
  const safe = Math.min(settings.padding, Math.floor(canvas.width / 3), Math.floor(canvas.height / 3));
""",
    """  const locked = settings.frameMode === 'locked';
  const layoutInset = Math.min(settings.padding, Math.floor(canvas.width / 3), Math.floor(canvas.height / 3));
  const printGuide = getPrintGuideGeometry(canvas, settings);
""",
    'page guide geometry',
)

page_guide_old = "<PageVisualGuides canvas={canvas} safe={safe} locked={locked} pageIndex={pageIndex} active={page?.id === activePageId} />"
page_guide_new = "<PageVisualGuides canvas={canvas} layoutInset={layoutInset} printGuide={printGuide} locked={locked} pageIndex={pageIndex} active={page?.id === activePageId} />"
count = app.count(page_guide_old)
if count != 2:
    raise SystemExit(f'page guide uses: expected 2, got {count}')
app = app.replace(page_guide_old, page_guide_new)

app = replace_once(
    app,
    """  const normalizedBookletPrintSettings = useMemo(
    () => normalizeBookletPrintSettings(bookletPrintSettings),
    [bookletPrintSettings],
  );
""",
    """  const normalizedBookletPrintSettings = useMemo(
    () => normalizeBookletPrintSettings(bookletPrintSettings),
    [bookletPrintSettings],
  );
  const normalizedPrintSettings = useMemo(
    () => normalizePrintSettings(settings, canvas),
    [settings, canvas],
  );
  const pagePrintGeometry = useMemo(
    () => getPrintPixelGeometry({ canvas, settings, kind: 'page' }),
    [canvas, settings],
  );
  const spreadPrintGeometry = useMemo(
    () => getPrintPixelGeometry({ canvas, settings, kind: 'spread' }),
    [canvas, settings],
  );
  const bookletPixelRatio = useMemo(
    () => getBookletPixelRatio(canvas, settings),
    [canvas, settings],
  );
""",
    'computed print geometry',
)

app = replace_once(
    app,
    """    if (key === 'showGuides' || key === 'borderColor' || key === 'borderWidth') return;
""",
    """    if (key === 'showGuides' || key === 'borderColor' || key === 'borderWidth' || PRINT_ONLY_SETTING_KEYS.has(key)) return;
""",
    'print-only setting guard',
)

app = replace_once(
    app,
    """  function updateCanvas(width, height, presetId = settings.presetId) {
    const nextCanvas = { width: clamp(width, 300, 5000), height: clamp(height, 300, 5000) };
    const nextSettings = { ...settings, presetId };
    setCanvas(nextCanvas);
    setSettings(nextSettings);
    rebuildAll(nextCanvas, nextSettings);
  }
""",
    """  function updateCanvas(width, height, presetId = settings.presetId, settingsPatch = {}) {
    const nextCanvas = { width: clamp(width, 300, 5000), height: clamp(height, 300, 5000) };
    const nextSettings = { ...settings, ...settingsPatch, presetId };
    setCanvas(nextCanvas);
    setSettings(nextSettings);
    rebuildAll(nextCanvas, nextSettings);
  }

  function applyDocumentPreset(presetId) {
    const preset = PRESETS.find((item) => item.id === presetId) ?? PRESETS[0];
    const nextSettings = settingsForPrintPreset(settings, preset.id);
    updateCanvas(preset.width, preset.height, preset.id, nextSettings);
  }

  function updatePhysicalSize(key, value) {
    setSettings((current) => ({ ...current, presetId: 'custom', [key]: value }));
  }
""",
    'preset and physical size handlers',
)

old_export = """  function exportPng(stageRefToExport, filename, message) {
    setSelectedFrameId(null);
    setMoveFrameWithPhotoId(null);
    requestAnimationFrame(() => requestAnimationFrame(async () => {
      await waitForFonts();
      const uri = stageRefToExport.current?.toDataURL({ pixelRatio: EXPORT_RATIO, mimeType: 'image/png' });
      if (!uri) return show('Не получилось собрать PNG');
      downloadDataUrl(filename, uri);
      show(message);
    }));
  }
"""
new_export = """  function lowResolutionWarnings(stageRefToExport, pixelRatio, minimumDpi = 180) {
    const nodes = stageRefToExport.current?.find?.('.print-photo') ?? [];
    return nodes.map((node) => {
      const source = node.image?.();
      if (!source) return null;
      const effectiveDpi = estimateEffectiveDpi({
        sourceWidth: source.naturalWidth || source.width,
        sourceHeight: source.naturalHeight || source.height,
        renderedWidth: node.width?.(),
        renderedHeight: node.height?.(),
        pixelRatio,
        targetDpi: normalizedPrintSettings.printDpi,
      });
      return effectiveDpi < minimumDpi
        ? { name: node.getAttr?.('photoName') || 'Фото', effectiveDpi }
        : null;
    }).filter(Boolean);
  }

  function confirmPrintResolution(stageRefToExport, pixelRatio) {
    const warnings = lowResolutionWarnings(stageRefToExport, pixelRatio);
    if (!warnings.length) return true;
    const lines = warnings.slice(0, 6).map((item) => `• ${item.name}: примерно ${item.effectiveDpi} DPI`);
    const suffix = warnings.length > 6 ? `\n• и ещё ${warnings.length - 6}` : '';
    return window.confirm(
      `Некоторые фото могут быть размыты при печати:\n\n${lines.join('\n')}${suffix}\n\nПродолжить экспорт?`,
    );
  }

  function exportPng(stageRefToExport, filename, message, geometry) {
    setSelectedFrameId(null);
    setMoveFrameWithPhotoId(null);
    requestAnimationFrame(() => requestAnimationFrame(async () => {
      try {
        await waitForFonts();
        if (!confirmPrintResolution(stageRefToExport, geometry.renderPixelRatio)) return;
        const raw = stageRefToExport.current?.toDataURL({ pixelRatio: geometry.renderPixelRatio, mimeType: 'image/png' });
        if (!raw) return show('Не получилось собрать PNG');
        const uri = await composePrintRaster(raw, geometry);
        downloadDataUrl(filename, uri);
        show(`${message} · ${geometry.outputWidthPx}×${geometry.outputHeightPx} px`);
      } catch (error) {
        console.warn('Print PNG export failed', error);
        show(error?.message || 'Не получилось собрать печатный PNG');
      }
    }));
  }
"""
app = replace_once(app, old_export, new_export, 'print export')

if 'EXPORT_RATIO' not in app:
    raise SystemExit('booklet export ratios: EXPORT_RATIO unexpectedly absent before replacement')
app = app.replace('pixelRatio: EXPORT_RATIO', 'pixelRatio: bookletPixelRatio')
if 'EXPORT_RATIO' in app:
    raise SystemExit('booklet export ratios: leftover EXPORT_RATIO')

old_document_grid = """          <div className="document-grid">
            <label className="field wide-field"><span>Размер страницы</span><select value={settings.presetId} onChange={(event) => { const preset = PRESETS.find((item) => item.id === event.target.value) ?? PRESETS[0]; updateCanvas(preset.width, preset.height, preset.id); }}>{PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select></label>
            <label className="field small-field"><span>Ширина px</span><SoftNumberInput min={300} max={5000} value={canvas.width} onValue={(value) => updateCanvas(value, canvas.height, 'custom')} /></label>
            <label className="field small-field"><span>Высота px</span><SoftNumberInput min={300} max={5000} value={canvas.height} onValue={(value) => updateCanvas(canvas.width, value, 'custom')} /></label>
            <label className="field small-field"><span>Фото-окон</span><select value={currentPage?.isBlankPage ? 0 : currentPageFrameCount} disabled={Boolean(currentPage?.isBlankPage) || albumMode !== 'collage'} onChange={(event) => updateSetting('frameCount', Number(event.target.value))}>{currentPage?.isBlankPage ? <option value={0}>пустая</option> : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((count) => <option key={count} value={count}>{count === 0 ? 'нет' : count}</option>)}</select></label>
            <label className="field small-field"><span>Зазор</span><SoftNumberInput min={0} max={200} value={settings.gap} onValue={(value) => updateSetting('gap', value)} /></label>
            <label className="field small-field"><span>Поля</span><SoftNumberInput min={0} max={300} value={settings.padding} onValue={(value) => updateSetting('padding', value)} /></label>
          </div>
"""
new_document_grid = """          <div className="document-grid">
            <label className="field wide-field"><span>Размер страницы</span><select value={settings.presetId} onChange={(event) => applyDocumentPreset(event.target.value)}>{PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select></label>
            <label className="field small-field"><span>Ширина мм</span><SoftNumberInput min={10} max={1000} step={0.1} value={normalizedPrintSettings.trimWidthMm} onValue={(value) => updatePhysicalSize('trimWidthMm', value)} /></label>
            <label className="field small-field"><span>Высота мм</span><SoftNumberInput min={10} max={1000} step={0.1} value={normalizedPrintSettings.trimHeightMm} onValue={(value) => updatePhysicalSize('trimHeightMm', value)} /></label>
            <label className="field small-field"><span>DPI</span><select value={normalizedPrintSettings.printDpi} onChange={(event) => updateSetting('printDpi', Number(event.target.value))}>{[150, 254, 300, 600].map((dpi) => <option key={dpi} value={dpi}>{dpi}</option>)}</select></label>
            <label className="field small-field"><span>Вылет мм</span><SoftNumberInput min={0} max={30} step={0.5} value={normalizedPrintSettings.bleedMm} onValue={(value) => updateSetting('bleedMm', value)} /></label>
            <label className="field small-field"><span>Безопасно мм</span><SoftNumberInput min={0} max={100} step={0.5} value={normalizedPrintSettings.safeMm} onValue={(value) => updateSetting('safeMm', value)} /></label>
            <label className="field small-field"><span>Макет шир. px</span><SoftNumberInput min={300} max={5000} value={canvas.width} onValue={(value) => updateCanvas(value, canvas.height, 'custom')} /></label>
            <label className="field small-field"><span>Макет выс. px</span><SoftNumberInput min={300} max={5000} value={canvas.height} onValue={(value) => updateCanvas(canvas.width, value, 'custom')} /></label>
            <label className="field small-field"><span>Фото-окон</span><select value={currentPage?.isBlankPage ? 0 : currentPageFrameCount} disabled={Boolean(currentPage?.isBlankPage) || albumMode !== 'collage'} onChange={(event) => updateSetting('frameCount', Number(event.target.value))}>{currentPage?.isBlankPage ? <option value={0}>пустая</option> : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((count) => <option key={count} value={count}>{count === 0 ? 'нет' : count}</option>)}</select></label>
            <label className="field small-field"><span>Зазор</span><SoftNumberInput min={0} max={200} value={settings.gap} onValue={(value) => updateSetting('gap', value)} /></label>
            <label className="field small-field"><span>Поля макета</span><SoftNumberInput min={0} max={300} value={settings.padding} onValue={(value) => updateSetting('padding', value)} /></label>
            <div className="print-summary"><strong>Печать:</strong> {formatPrintSummary(pagePrintGeometry)} · вылет по {normalizedPrintSettings.bleedMm} мм · safe zone {normalizedPrintSettings.safeMm} мм</div>
          </div>
"""
app = replace_once(app, old_document_grid, new_document_grid, 'document print controls')

app = replace_once(
    app,
    """            <button className="button accent" onClick={() => exportPng(printPageRef, `collage-page-${pad(currentPageIndex + 1)}.png`, 'Скачана страница')}>PNG страницы</button>
            <button className="button accent" onClick={() => exportPng(printSpreadRef, `collage-spread-${pad(spreadStart + 1)}-${pad(Math.min(spreadStart + 2, pages.length))}.png`, 'Скачан разворот')}>PNG разворота</button>
""",
    """            <button className="button accent" onClick={() => exportPng(printPageRef, `collage-page-${pad(currentPageIndex + 1)}.png`, 'Скачана страница', pagePrintGeometry)}>PNG страницы</button>
            <button className="button accent" onClick={() => exportPng(printSpreadRef, `collage-spread-${pad(spreadStart + 1)}-${pad(Math.min(spreadStart + 2, pages.length))}.png`, 'Скачан разворот', spreadPrintGeometry)}>PNG разворота</button>
""",
    'print export buttons',
)

app = replace_once(
    app,
    """              <strong>{isBooklet ? `${currentBookletSide?.title ?? 'Брошюра'} · ${stageRealWidth}×${stageRealHeight}px` : isSpread ? `Разворот · страницы ${spreadStart + 1}–${Math.min(spreadStart + 2, pages.length)} · ${canvas.width}×${canvas.height}px` : `Страница ${currentPageIndex + 1} · ${canvas.width}×${canvas.height}px`}</strong>
""",
    """              <strong>{isBooklet ? `${currentBookletSide?.title ?? 'Брошюра'} · ${stageRealWidth}×${stageRealHeight}px` : isSpread ? `Разворот · страницы ${spreadStart + 1}–${Math.min(spreadStart + 2, pages.length)} · ${canvas.width}×${canvas.height}px · печать ${spreadPrintGeometry.outputWidthPx}×${spreadPrintGeometry.outputHeightPx}px` : `Страница ${currentPageIndex + 1} · ${canvas.width}×${canvas.height}px · печать ${pagePrintGeometry.outputWidthPx}×${pagePrintGeometry.outputHeightPx}px`}</strong>
""",
    'canvas print summary',
)

APP.write_text(app, encoding='utf-8')

css = CSS.read_text(encoding='utf-8')
css = replace_once(
    css,
    """  max-width: 760px;
""",
    """  max-width: 1120px;
""",
    'document panel width',
)
css = replace_once(
    css,
    """.document-grid {
  display: grid;
  grid-template-columns: 255px 92px 92px 88px 78px 78px;
  align-items: end;
  gap: 7px;
}
""",
    """.document-grid {
  display: grid;
  grid-template-columns: minmax(220px, 1.8fr) repeat(5, minmax(82px, 1fr));
  align-items: end;
  gap: 7px;
}

.document-grid .wide-field { grid-column: span 1; }

.print-summary {
  grid-column: 1 / -1;
  border-top: 1px solid var(--ui-line);
  margin-top: 2px;
  padding-top: 7px;
  color: var(--ui-muted);
  font-size: 11px;
  font-weight: 750;
  line-height: 1.35;
}

.print-summary strong { color: var(--ui-green-dark); }
""",
    'print controls styles',
)
CSS.write_text(css, encoding='utf-8')

print('print geometry patch applied')
