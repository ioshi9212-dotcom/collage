import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/AppLive.jsx';
let source = readFileSync(path, 'utf-8');

function replaceOnce(before, after, label) {
  const first = source.indexOf(before);
  const last = source.lastIndexOf(before);
  if (first < 0) throw new Error(`Missing patch target: ${label}`);
  if (first !== last) throw new Error(`Patch target is not unique: ${label}`);
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

replaceOnce(
  "import { saveCloudProject } from './editor/cloudProjects';\n",
  "import { saveCloudProject } from './editor/cloudProjects';\nimport { compactProjectPhotos, hydrateProjectPhotos } from './editor/photoStorage';\n",
  'photo storage import',
);

replaceOnce(
`  function project() {
    return {
      version: 'live-22-booklet-polish-safety',
      canvas,
      settings,
      library,
      pages,
      currentPageId: album.currentPageId,
      viewMode,
      bookletSheetsPerBlock,
      bookletPrintSettings: normalizedBookletPrintSettings,
      extraLayers: normalizeExtraLayers(extraLayers),
      albumEditorMode: albumMode,
      savedAt: new Date().toISOString(),
    };
  }
`,
`  function project() {
    const compactedPhotos = compactProjectPhotos(library, pages);
    return {
      version: 'live-23-photo-library-references',
      canvas,
      settings,
      library: compactedPhotos.library,
      pages: compactedPhotos.pages,
      currentPageId: album.currentPageId,
      viewMode,
      bookletSheetsPerBlock,
      bookletPrintSettings: normalizedBookletPrintSettings,
      extraLayers: normalizeExtraLayers(extraLayers),
      albumEditorMode: albumMode,
      savedAt: new Date().toISOString(),
    };
  }
`,
  'project serialization',
);

replaceOnce(
`  function normalizePages(data, nextCanvas, nextSettings) {
    if (Array.isArray(data.pages) && data.pages.length) {
      return data.pages.map((page, index) => {
`,
`  function normalizePages(data, nextCanvas, nextSettings) {
    const hydratedPages = hydrateProjectPhotos(data.library, data.pages);
    if (hydratedPages.length) {
      return hydratedPages.map((page, index) => {
`,
  'page photo hydration',
);

replaceOnce(
`    if (Array.isArray(data.frames)) return [createPage(nextCanvas, nextSettings, 1, data.frames.map((frame) => cleanFrame(frame, nextCanvas)))];
`,
`    if (Array.isArray(data.frames)) {
      const [legacyPage] = hydrateProjectPhotos(data.library, [{ frames: data.frames }]);
      const legacyFrames = legacyPage?.frames ?? data.frames;
      return [createPage(nextCanvas, nextSettings, 1, legacyFrames.map((frame) => cleanFrame(frame, nextCanvas)))];
    }
`,
  'legacy frame photo hydration',
);

writeFileSync(path, source);
