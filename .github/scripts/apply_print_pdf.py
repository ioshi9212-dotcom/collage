from pathlib import Path

APP = Path('src/AppLive.jsx')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one match, got {count}')
    return text.replace(old, new, 1)


app = APP.read_text(encoding='utf-8')

app = replace_once(
    app,
    """import {
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
    """import {
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
import {
  addPngDensityMetadata,
  buildRasterPrintPdf,
  pngDataUrlToJpegPage,
} from './editor/printFiles';
""",
    'print file imports',
)

app = replace_once(
    app,
    """const SPREAD_GAP = 90;
const HANDLE = 28;
""",
    """const SPREAD_GAP = 90;
const HANDLE = 28;
const MAX_PDF_JPEG_BYTES = 350 * 1024 * 1024;
""",
    'PDF memory limit',
)

app = replace_once(
    app,
    """  const [bookletSideId, setBookletSideId] = useState(null);
  const [printBookletSideId, setPrintBookletSideId] = useState(null);
  const [notice, setNotice] = useState('');
""",
    """  const [bookletSideId, setBookletSideId] = useState(null);
  const [printBookletSideId, setPrintBookletSideId] = useState(null);
  const [printAlbumPageIndex, setPrintAlbumPageIndex] = useState(null);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [notice, setNotice] = useState('');
""",
    'PDF export state',
)

app = replace_once(
    app,
    """  const pages = album.pages;
  const currentPageIndex = Math.max(0, pages.findIndex((page) => page.id === album.currentPageId));
  const currentPage = pages[currentPageIndex] ?? pages[0];
  const currentPageFrameCount = resolvePageFrameCount(currentPage, settings);
""",
    """  const pages = album.pages;
  const currentPageIndex = Math.max(0, pages.findIndex((page) => page.id === album.currentPageId));
  const currentPage = pages[currentPageIndex] ?? pages[0];
  const exportPageIndex = printAlbumPageIndex ?? currentPageIndex;
  const exportPage = pages[exportPageIndex] ?? currentPage;
  const currentPageFrameCount = resolvePageFrameCount(currentPage, settings);
""",
    'hidden PDF page selection',
)

old_export = r"""  function lowResolutionWarnings(stageRefToExport, pixelRatio, minimumDpi = 180) {
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

new_export = r"""  function lowResolutionWarnings(stageRefToExport, pixelRatio, minimumDpi = 180) {
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

  function confirmResolutionWarnings(warnings) {
    if (!warnings.length) return true;
    const lines = warnings.slice(0, 8).map((item) => `• ${item.name}: примерно ${item.effectiveDpi} DPI`);
    const suffix = warnings.length > 8 ? `\n• и ещё ${warnings.length - 8}` : '';
    return window.confirm(
      `Некоторые фото могут быть размыты при печати:\n\n${lines.join('\n')}${suffix}\n\nПродолжить экспорт?`,
    );
  }

  function confirmPrintResolution(stageRefToExport, pixelRatio) {
    return confirmResolutionWarnings(lowResolutionWarnings(stageRefToExport, pixelRatio));
  }

  async function renderPrintPng(stageRefToExport, geometry, { checkResolution = true } = {}) {
    await waitForFonts();
    if (checkResolution && !confirmPrintResolution(stageRefToExport, geometry.renderPixelRatio)) return null;
    const raw = stageRefToExport.current?.toDataURL({ pixelRatio: geometry.renderPixelRatio, mimeType: 'image/png' });
    if (!raw) throw new Error('Не получилось собрать PNG');
    const raster = await composePrintRaster(raw, geometry);
    return addPngDensityMetadata(raster, geometry.printDpi);
  }

  function exportPng(stageRefToExport, filename, message, geometry) {
    setSelectedFrameId(null);
    setMoveFrameWithPhotoId(null);
    requestAnimationFrame(() => requestAnimationFrame(async () => {
      try {
        const uri = await renderPrintPng(stageRefToExport, geometry);
        if (!uri) return;
        downloadDataUrl(filename, uri);
        show(`${message} · ${geometry.outputWidthPx}×${geometry.outputHeightPx} px · ${geometry.printDpi} DPI записано`);
      } catch (error) {
        console.warn('Print PNG export failed', error);
        show(error?.message || 'Не получилось собрать печатный PNG');
      }
    }));
  }

  function printPdfMetadata(label, pageCount, geometry) {
    return {
      title: `Collage Creator — ${label}`,
      subject: `${pageCount} стр. · ${geometry.trimWidthMm}×${geometry.trimHeightMm} мм · ${geometry.printDpi} DPI · вылет ${geometry.bleedMm} мм · RGB raster`,
      creator: 'Collage Creator',
      producer: 'Collage Creator print engine',
      keywords: ['Collage Creator', 'album', 'print', 'RGB', `${geometry.printDpi} DPI`, `bleed ${geometry.bleedMm} mm`],
      language: 'ru-RU',
      createdAt: new Date(),
    };
  }

  function downloadPrintPdf(filename, pdfPages, metadata) {
    const bytes = buildRasterPrintPdf({ pages: pdfPages, metadata });
    downloadBlob(filename, new Blob([bytes], { type: 'application/pdf' }));
  }

  async function exportPdf(stageRefToExport, filename, label, geometry) {
    if (pdfExporting) return;
    setPdfExporting(true);
    setSelectedFrameId(null);
    setMoveFrameWithPhotoId(null);
    try {
      show(`Готовлю ${label}`);
      await nextPaint();
      const pngDataUrl = await renderPrintPng(stageRefToExport, geometry);
      if (!pngDataUrl) return;
      const pdfPage = await pngDataUrlToJpegPage(pngDataUrl, geometry, { quality: 0.97 });
      downloadPrintPdf(filename, [pdfPage], printPdfMetadata(label, 1, geometry));
      show(`Скачан ${label} · физический размер и TrimBox записаны`);
    } catch (error) {
      console.warn('Print PDF export failed', error);
      show(error?.message || 'Не получилось собрать печатный PDF');
    } finally {
      setPdfExporting(false);
    }
  }

  async function collectAlbumResolutionWarnings() {
    const warnings = [];
    for (let index = 0; index < pages.length; index += 1) {
      setPrintAlbumPageIndex(index);
      await nextPaint();
      warnings.push(...lowResolutionWarnings(printPageRef, pagePrintGeometry.renderPixelRatio).map((item) => ({
        ...item,
        name: `Стр. ${index + 1} · ${item.name}`,
      })));
    }
    return warnings;
  }

  async function exportAlbumPdf() {
    if (pdfExporting) return;
    setPdfExporting(true);
    setSelectedFrameId(null);
    setMoveFrameWithPhotoId(null);
    try {
      show(`Проверяю фотографии: ${pages.length} стр.`);
      const warnings = await collectAlbumResolutionWarnings();
      if (!confirmResolutionWarnings(warnings)) return;

      const pdfPages = [];
      let sourceBytes = 0;
      for (let index = 0; index < pages.length; index += 1) {
        setPrintAlbumPageIndex(index);
        await nextPaint();
        show(`Готовлю PDF альбома: ${index + 1}/${pages.length}`);
        const pngDataUrl = await renderPrintPng(printPageRef, pagePrintGeometry, { checkResolution: false });
        const pdfPage = await pngDataUrlToJpegPage(pngDataUrl, pagePrintGeometry, { quality: 0.96 });
        sourceBytes += pdfPage.jpegBytes.length;
        if (sourceBytes > MAX_PDF_JPEG_BYTES) {
          throw new Error('PDF получается слишком большим. Раздели альбом на две части или выбери меньший DPI.');
        }
        pdfPages.push(pdfPage);
      }

      downloadPrintPdf(
        `collage-album-${pages.length}-pages.pdf`,
        pdfPages,
        printPdfMetadata(`альбом ${pages.length} стр.`, pages.length, pagePrintGeometry),
      );
      show(`Скачан PDF альбома: ${pages.length} страниц`);
    } catch (error) {
      console.warn('Album PDF export failed', error);
      show(error?.message || 'Не получилось собрать PDF альбома');
    } finally {
      setPrintAlbumPageIndex(null);
      setPdfExporting(false);
    }
  }
"""

app = replace_once(app, old_export, new_export, 'PNG and PDF export functions')

app = replace_once(
    app,
    """            <button className="button accent" onClick={() => exportPng(printPageRef, `collage-page-${pad(currentPageIndex + 1)}.png`, 'Скачана страница', pagePrintGeometry)}>PNG страницы</button>
            <button className="button accent" onClick={() => exportPng(printSpreadRef, `collage-spread-${pad(spreadStart + 1)}-${pad(Math.min(spreadStart + 2, pages.length))}.png`, 'Скачан разворот', spreadPrintGeometry)}>PNG разворота</button>
""",
    """            <button className="button accent" disabled={pdfExporting} onClick={() => exportPng(printPageRef, `collage-page-${pad(currentPageIndex + 1)}.png`, 'Скачана страница', pagePrintGeometry)}>PNG страницы</button>
            <button className="button accent" disabled={pdfExporting} onClick={() => exportPng(printSpreadRef, `collage-spread-${pad(spreadStart + 1)}-${pad(Math.min(spreadStart + 2, pages.length))}.png`, 'Скачан разворот', spreadPrintGeometry)}>PNG разворота</button>
            <button className="button" disabled={pdfExporting} onClick={() => exportPdf(printPageRef, `collage-page-${pad(currentPageIndex + 1)}.pdf`, 'PDF страницы', pagePrintGeometry)}>PDF страницы</button>
            <button className="button" disabled={pdfExporting} onClick={() => exportPdf(printSpreadRef, `collage-spread-${pad(spreadStart + 1)}-${pad(Math.min(spreadStart + 2, pages.length))}.pdf`, 'PDF разворота', spreadPrintGeometry)}>PDF разворота</button>
            <button className="button accent" disabled={pdfExporting} onClick={exportAlbumPdf}>{pdfExporting ? 'Готовлю PDF…' : 'PDF альбома'}</button>
""",
    'PDF export buttons',
)

app = replace_once(
    app,
    """        <Stage ref={printPageRef} width={canvas.width} height={canvas.height}>
          <Layer>
            <PageLayer page={currentPage} pageIndex={currentPageIndex} x={0} {...commonPageLayerProps} />
            <ExtraPageLayers extraLayers={extraLayers} pageIndex={currentPageIndex} x={0} y={0} printMode />
          </Layer>
        </Stage>
""",
    """        <Stage ref={printPageRef} width={canvas.width} height={canvas.height}>
          <Layer>
            <PageLayer page={exportPage} pageIndex={exportPageIndex} x={0} {...commonPageLayerProps} />
            <ExtraPageLayers extraLayers={extraLayers} pageIndex={exportPageIndex} x={0} y={0} printMode />
          </Layer>
        </Stage>
""",
    'hidden album PDF stage',
)

APP.write_text(app, encoding='utf-8')
print('print PDF editor patch applied')
