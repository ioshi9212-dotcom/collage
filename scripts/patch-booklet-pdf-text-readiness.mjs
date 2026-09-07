import { readFile, writeFile } from 'node:fs/promises';

const appPath = 'src/AppLive.jsx';
let text = await readFile(appPath, 'utf8');

const extraStart = text.indexOf('function ExtraPageLayers({');
const extraEnd = text.indexOf('function PageNumberLayer(', extraStart);
if (extraStart < 0 || extraEnd < 0) throw new Error('ExtraPageLayers block not found');
let extraBlock = text.slice(extraStart, extraEnd);
const textNeedle = `          <Text\n            key={item.id ?? \`\${pageIndex}-\${item.x}-\${item.y}\`}\n            x={Number(item.x) || 0}`;
const textReplacement = `          <Text\n            key={item.id ?? \`\${pageIndex}-\${item.x}-\${item.y}\`}\n            name="extra-text-layer"\n            textLayerId={String(item.id ?? '')}\n            textLayerPageId={String(pageId ?? '')}\n            x={Number(item.x) || 0}`;
if ((extraBlock.match(new RegExp(textNeedle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length !== 1) {
  throw new Error('Extra text node marker not found exactly once');
}
extraBlock = extraBlock.replace(textNeedle, textReplacement);
text = text.slice(0, extraStart) + extraBlock + text.slice(extraEnd);

const marker = '  function photoReferencesForBookletSide(sideData) {';
const helperStart = text.indexOf(marker);
if (helperStart < 0) throw new Error('photoReferencesForBookletSide not found');
let pos = helperStart;
let depth = 0;
let opened = false;
let helperEnd = -1;
for (; pos < text.length; pos += 1) {
  const char = text[pos];
  if (char === '{') { depth += 1; opened = true; }
  else if (char === '}') {
    depth -= 1;
    if (opened && depth === 0) { helperEnd = pos + 1; break; }
  }
}
if (helperEnd < 0) throw new Error('photoReferencesForBookletSide end not found');

const helpers = `

  function textReferencesForBookletSide(sideData) {
    return (sideData?.slots ?? []).flatMap((slot) => {
      const pageIndex = slot?.sourcePageIndex;
      if (pageIndex == null || pageIndex < 0) return [];
      const page = pages[pageIndex];
      const pageId = String(page?.id ?? '');
      return textLayersForPage(extraLayers, pageIndex, page?.id ?? null)
        .map((item) => ({ pageId, textId: String(item?.id ?? '') }))
        .filter((item) => item.textId);
    });
  }

  function renderedPrintTextKeys(stageRef) {
    const stage = stageRef?.current;
    if (!stage?.find) return new Set();
    return new Set(Array.from(stage.find('.extra-text-layer') ?? []).map((node) => (
      \`\${String(node.getAttr('textLayerPageId') ?? '')}::\${String(node.getAttr('textLayerId') ?? '')}\`
    )));
  }

  async function waitForPrintTexts(stageRef, references, context, timeoutMs = 5000) {
    const expected = [...new Set((references ?? []).map((item) => \`\${item.pageId}::\${item.textId}\`))];
    if (!expected.length) return;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const rendered = renderedPrintTextKeys(stageRef);
      if (expected.every((key) => rendered.has(key))) {
        await waitForFonts();
        stageRef.current?.batchDraw?.();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        stageRef.current?.draw?.();
        const finalRendered = renderedPrintTextKeys(stageRef);
        if (expected.every((key) => finalRendered.has(key))) return;
      }
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    throw new Error(\`Не все надписи успели подготовиться для печати (\${context}). Повтори экспорт.\`);
  }
`;
if (!text.includes('function waitForPrintTexts(')) {
  text = text.slice(0, helperEnd) + helpers + text.slice(helperEnd);
}

const oldRaster = `    setPrintBookletSideId(sideData.id);\n    await nextPaint();\n    await waitForPrintPhotos(printBookletRef, photoReferencesForBookletSide(sideData), \`листе \${sideData.title || sideData.id}\`);\n    if (checkResolution && !confirmPrintResolution(printBookletRef, bookletA4Geometry.renderPixelRatio)) return null;\n    const raw = printBookletRef.current?.toDataURL({ pixelRatio: bookletA4Geometry.renderPixelRatio, mimeType: 'image/png' });`;
const newRaster = `    setPrintBookletSideId(sideData.id);\n    const printTextReferences = textReferencesForBookletSide(sideData);\n    await nextPaint();\n    await waitForPrintTexts(printBookletRef, printTextReferences, \`листе \${sideData.title || sideData.id}\`);\n    await waitForPrintPhotos(printBookletRef, photoReferencesForBookletSide(sideData), \`листе \${sideData.title || sideData.id}\`);\n    await waitForPrintTexts(printBookletRef, printTextReferences, \`листе \${sideData.title || sideData.id}\`);\n    printBookletRef.current?.draw?.();\n    if (checkResolution && !confirmPrintResolution(printBookletRef, bookletA4Geometry.renderPixelRatio)) return null;\n    const raw = printBookletRef.current?.toDataURL({ pixelRatio: bookletA4Geometry.renderPixelRatio, mimeType: 'image/png' });`;
if (!text.includes(oldRaster)) throw new Error('Booklet raster block not found');
text = text.replace(oldRaster, newRaster);
await writeFile(appPath, text);

const testPath = 'src/editor/appIntegration.test.mjs';
let test = await readFile(testPath, 'utf8');
const contracts = `
assert.match(appSource, /name="extra-text-layer"[\\s\\S]*?textLayerId=\\{String\\(item\\.id \\?\\? ''\\)\\}[\\s\\S]*?textLayerPageId=\\{String\\(pageId \\?\\? ''\\)\\}/, 'print text nodes must expose stable page/text identifiers');
assert.match(appSource, /function waitForPrintTexts\\([\\s\\S]*?stageRef\\.current\\?\\.draw\\?\\.\\(\\)/, 'print export must wait for and force-draw text layers');
assert.match(appSource, /setPrintBookletSideId\\(sideData\\.id\\)[\\s\\S]*?await waitForPrintTexts\\(printBookletRef,[\\s\\S]*?await waitForPrintPhotos\\(printBookletRef,[\\s\\S]*?await waitForPrintTexts\\(printBookletRef,[\\s\\S]*?printBookletRef\\.current\\?\\.toDataURL/, 'booklet PDF must verify text before and after photo readiness before rasterizing');
`;
if (!test.includes('print text nodes must expose stable page/text identifiers')) test += contracts;
await writeFile(testPath, test);
