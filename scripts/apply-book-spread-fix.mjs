import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const appPath = 'src/AppLive.jsx';
const testPath = 'src/editor/albumFlipPreview.test.mjs';
let app = readFileSync(appPath, 'utf8');

function replaceOnce(before, after, label) {
  if (!app.includes(before)) throw new Error(`Cannot patch ${label}: source pattern not found`);
  app = app.replace(before, after);
}

replaceOnce(
`import {
  DEFAULT_PAGE_NUMBERING,
  normalizePageNumbering,
  pageNumberPlacement,
  pageNumberValue,
} from './editor/pageNumbering';`,
`import {
  DEFAULT_PAGE_NUMBERING,
  normalizePageNumbering,
  pageNumberPlacement,
  pageNumberValue,
} from './editor/pageNumbering';
import {
  albumSpreadForPage,
  albumSpreadPages,
  albumVisiblePageLabel,
} from './editor/albumFlipModel';`,
'album spread imports',
);

replaceOnce(
`  const spreadStart = currentPageIndex % 2 === 0 ? currentPageIndex : currentPageIndex - 1;`,
`  const spreadIndex = albumSpreadForPage(currentPageIndex, pages.length);
  const spreadPages = albumSpreadPages(spreadIndex, pages.length);
  const spreadPageIndexes = [spreadPages.left, spreadPages.right].filter((index) => index != null);
  const spreadStart = spreadPageIndexes[0] ?? currentPageIndex;
  const spreadPageCount = Math.max(1, spreadPageIndexes.length);
  const spreadVisibleLabel = albumVisiblePageLabel(spreadIndex, pages.length);
  const spreadFileLabel = spreadPageIndexes.length
    ? spreadPageIndexes.map((index) => pad(index + 1)).join('-')
    : pad(currentPageIndex + 1);`,
'book spread state',
);

replaceOnce(
`      : scope === 'spread'
        ? [spreadStart, spreadStart + 1].filter((index) => index >= 0 && index < pages.length)
        : pages.map((_, index) => index);`,
`      : scope === 'spread'
        ? spreadPageIndexes
        : pages.map((_, index) => index);`,
'spread template source pages',
);

replaceOnce(
`    const count = mode === 'spread' ? Math.min(2, recordPages.length) : 1;
    const start = mode === 'spread' ? spreadStart : currentPageIndex;`,
`    const count = mode === 'spread' ? Math.min(spreadPageCount, recordPages.length) : 1;
    const start = mode === 'spread' ? spreadStart : currentPageIndex;`,
'spread template target count',
);

replaceOnce(
`    : isSpread
      ? [
          { page: pages[spreadStart], pageIndex: spreadStart, x: 0 },
          { page: pages[spreadStart + 1], pageIndex: pages[spreadStart + 1] ? spreadStart + 1 : -1, x: canvas.width + SPREAD_GAP },
        ]
      : [{ page: currentPage, pageIndex: currentPageIndex, x: 0 }];`,
`    : isSpread
      ? spreadPageIndexes.map((pageIndex, position) => ({
          page: pages[pageIndex],
          pageIndex,
          x: position * (canvas.width + SPREAD_GAP),
        }))
      : [{ page: currentPage, pageIndex: currentPageIndex, x: 0 }];`,
'spread stage entries',
);

replaceOnce(
`  const stageRealWidth = isBooklet ? bookletSheetSize.width : isSpread ? canvas.width * 2 + SPREAD_GAP : canvas.width;`,
`  const stageRealWidth = isBooklet
    ? bookletSheetSize.width
    : isSpread
      ? canvas.width * spreadPageCount + SPREAD_GAP * Math.max(0, spreadPageCount - 1)
      : canvas.width;`,
'spread stage width',
);

replaceOnce(
`  const spreadPrintGeometry = useMemo(
    () => getPrintPixelGeometry({ canvas, settings, kind: 'spread' }),
    [canvas, settings],
  );`,
`  const spreadPrintGeometry = useMemo(
    () => getPrintPixelGeometry({ canvas, settings, kind: 'spread' }),
    [canvas, settings],
  );
  const activeSpreadPrintGeometry = spreadPageCount === 1 ? pagePrintGeometry : spreadPrintGeometry;`,
'opening spread print geometry',
);

replaceOnce(
`            <span>{isBooklet ? (currentBookletSide?.title ?? 'Брошюра') : isSpread ? \`Разворот \${spreadStart + 1}–\${Math.min(spreadStart + 2, pages.length)}\` : \`Страница \${currentPageIndex + 1} из \${pages.length}\`}</span>`,
`            <span>{isBooklet ? (currentBookletSide?.title ?? 'Брошюра') : isSpread ? spreadVisibleLabel : \`Страница \${currentPageIndex + 1} из \${pages.length}\`}</span>`,
'header spread label',
);

replaceOnce(
`                <button className="button" type="button" disabled={pdfExporting} onClick={() => { setExportMenuOpen(false); exportPng(printSpreadRef, \`collage-spread-\${pad(spreadStart + 1)}-\${pad(Math.min(spreadStart + 2, pages.length))}.png\`, 'Скачан разворот', spreadPrintGeometry, [pages[spreadStart], pages[spreadStart + 1]].flatMap(buildPrintPhotoReferences)); }}>PNG разворота</button>`,
`                <button className="button" type="button" disabled={pdfExporting} onClick={() => { setExportMenuOpen(false); exportPng(printSpreadRef, \`collage-spread-\${spreadFileLabel}.png\`, 'Скачан разворот', activeSpreadPrintGeometry, spreadPageIndexes.flatMap((index) => buildPrintPhotoReferences(pages[index]))); }}>PNG разворота</button>`,
'PNG spread export',
);

replaceOnce(
`                <button className="button" type="button" disabled={pdfExporting} onClick={() => { setExportMenuOpen(false); exportPdf(printSpreadRef, \`collage-spread-\${pad(spreadStart + 1)}-\${pad(Math.min(spreadStart + 2, pages.length))}.pdf\`, 'PDF разворота', spreadPrintGeometry, [pages[spreadStart], pages[spreadStart + 1]].flatMap(buildPrintPhotoReferences)); }}>PDF разворота</button>`,
`                <button className="button" type="button" disabled={pdfExporting} onClick={() => { setExportMenuOpen(false); exportPdf(printSpreadRef, \`collage-spread-\${spreadFileLabel}.pdf\`, 'PDF разворота', activeSpreadPrintGeometry, spreadPageIndexes.flatMap((index) => buildPrintPhotoReferences(pages[index]))); }}>PDF разворота</button>`,
'PDF spread export',
);

replaceOnce(
`              const isSpreadPage = isSpread && (index === spreadStart || index === spreadStart + 1);`,
`              const isSpreadPage = isSpread && spreadPageIndexes.includes(index);`,
'page rail spread membership',
);

replaceOnce(
`                : (isBlankPage ? 'белая страница' : (index % 2 === 0 ? 'левая' : 'правая'));`,
`                : (isBlankPage ? 'белая страница' : (pageNumber % 2 === 0 ? 'левая' : 'правая'));`,
'book page side labels',
);

replaceOnce(
`              <strong>{isBooklet ? \`\${currentBookletSide?.title ?? 'Брошюра'} · \${stageRealWidth}×\${stageRealHeight}px\` : isSpread ? \`Разворот · страницы \${spreadStart + 1}–\${Math.min(spreadStart + 2, pages.length)} · \${canvas.width}×\${canvas.height}px · печать \${spreadPrintGeometry.outputWidthPx}×\${spreadPrintGeometry.outputHeightPx}px\` : \`Страница \${currentPageIndex + 1} · \${canvas.width}×\${canvas.height}px · печать \${pagePrintGeometry.outputWidthPx}×\${pagePrintGeometry.outputHeightPx}px\`}</strong>`,
`              <strong>{isBooklet ? \`\${currentBookletSide?.title ?? 'Брошюра'} · \${stageRealWidth}×\${stageRealHeight}px\` : isSpread ? \`\${spreadVisibleLabel} · \${canvas.width}×\${canvas.height}px · печать \${activeSpreadPrintGeometry.outputWidthPx}×\${activeSpreadPrintGeometry.outputHeightPx}px\` : \`Страница \${currentPageIndex + 1} · \${canvas.width}×\${canvas.height}px · печать \${pagePrintGeometry.outputWidthPx}×\${pagePrintGeometry.outputHeightPx}px\`}</strong>`,
'toolbar spread label',
);

replaceOnce(
`              <em>{isBooklet ? 'Это режим просмотра и PNG-экспорта брошюры. Редактирование страниц делай в режиме Страница или Разворот.' : 'PNG страницы сохраняет одну страницу. PNG разворота склеивает две страницы в один файл без зазора.'}</em>`,
`              <em>{isBooklet ? 'Это режим просмотра и PNG-экспорта брошюры. Редактирование страниц делай в режиме Страница или Разворот.' : 'PNG страницы сохраняет одну страницу. PNG разворота сохраняет текущую книжную пару; первая страница сохраняется одна.'}</em>`,
'spread export help',
);

replaceOnce(
`                  {isSpread && !collagePreviewOnly && settings.showGuides && <Line points={[canvas.width + SPREAD_GAP / 2, 0, canvas.width + SPREAD_GAP / 2, canvas.height]} stroke={locked ? '#2f7d52' : '#c27b4f'} strokeWidth={3} dash={[24, 18]} opacity={0.55} listening={false} />}`,
`                  {isSpread && spreadPageCount > 1 && !collagePreviewOnly && settings.showGuides && <Line points={[canvas.width + SPREAD_GAP / 2, 0, canvas.width + SPREAD_GAP / 2, canvas.height]} stroke={locked ? '#2f7d52' : '#c27b4f'} strokeWidth={3} dash={[24, 18]} opacity={0.55} listening={false} />}`,
'spread center guide',
);

replaceOnce(
`        <Stage ref={printSpreadRef} width={canvas.width * 2} height={canvas.height}>
          <Layer>
            <PageLayer page={pages[spreadStart]} pageIndex={spreadStart} x={0} {...commonPageLayerProps} />
            <ExtraPageLayers extraLayers={extraLayers} pageIndex={spreadStart} x={0} y={0} printMode />
            <PageNumberLayer pageIndex={spreadStart} x={0} canvas={canvas} settings={pageNumbering} />
            <PageLayer page={pages[spreadStart + 1]} pageIndex={spreadStart + 1} x={canvas.width} {...commonPageLayerProps} />
            <ExtraPageLayers extraLayers={extraLayers} pageIndex={spreadStart + 1} x={canvas.width} y={0} printMode />
            {pages[spreadStart + 1] && <PageNumberLayer pageIndex={spreadStart + 1} x={canvas.width} canvas={canvas} settings={pageNumbering} />}
          </Layer>
        </Stage>`,
`        <Stage ref={printSpreadRef} width={canvas.width * spreadPageCount} height={canvas.height}>
          <Layer>
            {spreadPageIndexes.map((pageIndex, position) => (
              <React.Fragment key={\`print-spread-\${pageIndex}\`}>
                <PageLayer page={pages[pageIndex]} pageIndex={pageIndex} x={position * canvas.width} {...commonPageLayerProps} />
                <ExtraPageLayers extraLayers={extraLayers} pageIndex={pageIndex} x={position * canvas.width} y={0} printMode />
                <PageNumberLayer pageIndex={pageIndex} x={position * canvas.width} canvas={canvas} settings={pageNumbering} />
              </React.Fragment>
            ))}
          </Layer>
        </Stage>`,
'print spread stage',
);

writeFileSync(appPath, app);

let test = readFileSync(testPath, 'utf8');
const marker = "const editorSource = readFileSync(resolve(process.cwd(), 'src/AppLive.jsx'), 'utf8');";
if (!test.includes(marker)) {
  const insertion = `\nconst editorSource = readFileSync(resolve(process.cwd(), 'src/AppLive.jsx'), 'utf8');\nassert.ok(editorSource.includes("albumSpreadForPage(currentPageIndex, pages.length)"), 'editor spread must use book spread numbering');\nassert.ok(editorSource.includes("albumSpreadPages(spreadIndex, pages.length)"), 'editor spread must share the album spread model');\nassert.ok(editorSource.includes("spreadPageIndexes.map((pageIndex, position)"), 'editor spread must render the opening page alone and later pages as pairs');\nassert.ok(editorSource.includes("pageNumber % 2 === 0 ? 'левая' : 'правая'"), 'even book pages must be left and odd pages must be right');\nassert.ok(editorSource.includes("width={canvas.width * spreadPageCount}"), 'spread export width must support a single opening page');\nassert.ok(!editorSource.includes("currentPageIndex % 2 === 0 ? currentPageIndex : currentPageIndex - 1"), 'legacy 1-2 / 3-4 spread pairing must be removed');\n`;
  test = test.replace("const previewSource = readFileSync(resolve(process.cwd(), 'src/editor/AlbumFlipPreview.jsx'), 'utf8');", insertion + "\nconst previewSource = readFileSync(resolve(process.cwd(), 'src/editor/AlbumFlipPreview.jsx'), 'utf8');");
  writeFileSync(testPath, test);
}

const checkedApp = readFileSync(appPath, 'utf8');
assert.ok(checkedApp.includes('spreadPageIndexes'));
assert.ok(checkedApp.includes('activeSpreadPrintGeometry'));
console.log('Book spread editor migration applied');
