import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';

const appPath = 'src/AppLive.jsx';
let source = readFileSync(appPath, 'utf8');

function replaceOnce(search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Missing AppLive marker: ${label}`);
  source = source.replace(search, replacement);
}

replaceOnce(
  "import PhotoLibraryThumbnail from './editor/PhotoLibraryThumbnail';",
  "import PhotoLibraryThumbnail from './editor/PhotoLibraryThumbnail';\nimport PhotoImportReport from './editor/PhotoImportReport';",
  'photo component import',
);

replaceOnce(
  "import { prepareLocalPhotoFiles } from './editor/localHeicUploadBridge';",
  "import { prepareLocalPhotoFiles } from './editor/localHeicUploadBridge';\nimport { buildPhotoImportReport } from './editor/photoImportReport';",
  'report helper import',
);

replaceOnce(
  "  const [photoImportProgress, setPhotoImportProgress] = useState({\n    visible: false,\n    status: 'idle',\n    percent: 0,\n    label: '',\n    detail: '',\n    processed: 0,\n    total: 0,\n  });\n  const [moveFrameWithPhotoId, setMoveFrameWithPhotoId] = useState(null);",
  "  const [photoImportProgress, setPhotoImportProgress] = useState({\n    visible: false,\n    status: 'idle',\n    percent: 0,\n    label: '',\n    detail: '',\n    processed: 0,\n    total: 0,\n  });\n  const [photoImportReport, setPhotoImportReport] = useState(null);\n  const [moveFrameWithPhotoId, setMoveFrameWithPhotoId] = useState(null);",
  'photo report state',
);

const functionStart = source.indexOf('  async function uploadPhotos(event) {');
const functionEnd = source.indexOf('\n  function putPhoto(pageId, frameId, photo) {', functionStart);
if (functionStart < 0 || functionEnd < 0) throw new Error('Could not locate uploadPhotos function');

const replacementFunction = `  async function uploadPhotos(event) {
    const input = event.currentTarget;
    const rawFiles = Array.from(input.files ?? []);
    input.value = '';
    if (photoUploadInFlightRef.current) return show('Дождись окончания текущей загрузки фото');
    if (!rawFiles.length) return;

    setPhotoImportReport(null);
    const unique = filterDuplicatePhotoUploads(rawFiles, library);
    const initialSelection = selectPhotoUploads(unique.accepted, library.length);

    if (!unique.accepted.length) {
      const report = buildPhotoImportReport({ selectedFiles: rawFiles, duplicates: unique.duplicates });
      setPhotoImportReport(report);
      if (unique.duplicates.length === 1) return show(\`Фото «\${unique.duplicates[0]?.name || 'выбранное фото'}» уже загружено\`);
      return show(\`Все выбранные фото уже загружены: \${unique.duplicates.length}\`);
    }

    if (!initialSelection.accepted.length) {
      const report = buildPhotoImportReport({ selectedFiles: rawFiles, duplicates: unique.duplicates, initialSelection });
      setPhotoImportReport(report);
      if (initialSelection.rejectedSize) return show('Фото слишком большие. Максимум 25 МБ на файл.');
      if (initialSelection.rejectedLimit) return show(\`В библиотеке можно хранить не больше \${MAX_LIBRARY_PHOTOS} фото\`);
      return show('Подходящих изображений не найдено');
    }

    photoUploadInFlightRef.current = true;
    setPhotoImporting(true);
    const uploadTotal = rawFiles.length;
    showPhotoImportProgress({
      percent: 2,
      label: 'Подготавливаю фото',
      detail: \`Выбрано: \${uploadTotal}\`,
      processed: 0,
      total: uploadTotal,
    });

    let prepared = { files: [], failed: [], converted: 0 };
    let selection = { accepted: [], rejectedTypeFiles: [], rejectedSizeFiles: [], rejectedLimitFiles: [] };
    let loadedCount = 0;
    const storageFailures = [];

    try {
      prepared = await prepareLocalPhotoFiles(initialSelection.accepted, {
        onProgress: ({ index, total, name }) => {
          const safeTotal = Math.max(1, total);
          showPhotoImportProgress({
            percent: 5 + (index / safeTotal) * 30,
            label: 'Преобразую HEIC',
            detail: \`\${index + 1} из \${total} · \${name}\`,
            processed: index,
            total,
          });
          show(\`Преобразую HEIC: \${index + 1} из \${total} · \${name}\`);
        },
      });
      selection = selectPhotoUploads(prepared.files, library.length);

      if (!selection.accepted.length) {
        const report = buildPhotoImportReport({
          selectedFiles: rawFiles,
          duplicates: unique.duplicates,
          initialSelection,
          prepared,
          finalSelection: selection,
        });
        setPhotoImportReport(report);
        let errorMessage = 'Подходящих изображений не найдено';
        if (prepared.failed.length) {
          const first = prepared.failed[0];
          errorMessage = \`Не удалось преобразовать HEIC «\${first?.file?.name || 'Фото'}»: \${first?.error?.message || 'неизвестная ошибка'}\`;
        } else if (selection.rejectedSize) {
          errorMessage = 'После преобразования фото получилось больше 25 МБ.';
        }
        show(errorMessage);
        finishPhotoImportProgress({ status: 'error', label: 'Фото не добавлены', detail: errorMessage });
        return;
      }

      const chunkSize = 2;
      const storeTotal = selection.accepted.length;
      showPhotoImportProgress({
        percent: 35,
        label: 'Сохраняю фото',
        detail: \`0 из \${storeTotal}\`,
        processed: 0,
        total: storeTotal,
      });
      for (let offset = 0; offset < storeTotal; offset += chunkSize) {
        const chunk = selection.accepted.slice(offset, offset + chunkSize);
        const finish = Math.min(storeTotal, offset + chunk.length);
        showPhotoImportProgress({
          percent: 35 + (offset / Math.max(1, storeTotal)) * 65,
          label: 'Сохраняю фото',
          detail: \`\${offset + 1}–\${finish} из \${storeTotal}\`,
          processed: offset,
          total: storeTotal,
        });
        show(\`Сохраняю фото: \${finish} из \${storeTotal}\`);
        const result = await persistPhotoFiles(chunk, { idFactory: makeId, maxConcurrent: 1 });
        loadedCount += result.loaded.length;
        storageFailures.push(...result.failed);
        if (result.loaded.length) {
          setLibrary((current) => [...current, ...result.loaded].slice(0, MAX_LIBRARY_PHOTOS));
        }
        showPhotoImportProgress({
          percent: 35 + (finish / Math.max(1, storeTotal)) * 65,
          label: 'Сохраняю фото',
          detail: \`\${finish} из \${storeTotal}\`,
          processed: finish,
          total: storeTotal,
        });
        await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      }

      const report = buildPhotoImportReport({
        selectedFiles: rawFiles,
        added: loadedCount,
        duplicates: unique.duplicates,
        initialSelection,
        prepared,
        finalSelection: selection,
        storageFailures,
      });
      setPhotoImportReport(report);

      const convertedSuffix = prepared.converted ? \` · HEIC → JPEG: \${prepared.converted}\` : '';
      const notAddedSuffix = report.notAdded ? \` · не добавлено: \${report.notAdded}\` : '';
      const resultMessage = \`Добавлено \${loadedCount} из \${report.selected}\${convertedSuffix}\${notAddedSuffix}\`;
      show(resultMessage);
      finishPhotoImportProgress({
        status: 'done',
        label: report.notAdded ? 'Загрузка завершена не полностью' : 'Фото загружены',
        detail: \`Добавлено: \${loadedCount} из выбранных \${report.selected}\${report.notAdded ? \` · не добавлено: \${report.notAdded}\` : ''}\`,
      });
    } catch (error) {
      console.warn('Photo import failed', error);
      const errorMessage = error?.message || 'Не удалось загрузить фотографии';
      const report = buildPhotoImportReport({
        selectedFiles: rawFiles,
        added: loadedCount,
        duplicates: unique.duplicates,
        initialSelection,
        prepared,
        finalSelection: selection,
        storageFailures,
        unexpectedError: error,
      });
      setPhotoImportReport(report);
      show(errorMessage);
      finishPhotoImportProgress({ status: 'error', label: 'Ошибка загрузки', detail: errorMessage });
    } finally {
      photoUploadInFlightRef.current = false;
      setPhotoImporting(false);
    }
  }
`;

source = source.slice(0, functionStart) + replacementFunction + source.slice(functionEnd);

replaceOnce(
  "              )}\n              <button className=\"button full\" onClick={() => { setLibrary([]); setSelectedPhotoId(null); show('Список фото очищен'); }} disabled={library.length === 0 || photoImporting}>Очистить список фото</button>",
  "              )}\n              <PhotoImportReport report={photoImportReport} onClose={() => setPhotoImportReport(null)} />\n              <button className=\"button full\" onClick={() => { setLibrary([]); setSelectedPhotoId(null); setPhotoImportReport(null); show('Список фото очищен'); }} disabled={library.length === 0 || photoImporting}>Очистить список фото</button>",
  'photo report panel',
);

writeFileSync(appPath, source);
unlinkSync('scripts/apply-photo-import-report.mjs');
unlinkSync('.github/workflows/apply-photo-import-report.yml');
