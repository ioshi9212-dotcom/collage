import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing patch target: ${label}`);
  if (source.indexOf(before) !== source.lastIndexOf(before)) throw new Error(`Ambiguous patch target: ${label}`);
  return source.replace(before, after);
}

let app = readFileSync('src/AppLive.jsx', 'utf8');

app = replaceOnce(app,
  "  const photoUploadInFlightRef = useRef(false);",
  "  const photoUploadInFlightRef = useRef(false);\n  const photoProgressTimerRef = useRef(null);",
  'photo progress timer ref');

app = replaceOnce(app,
  "  const [photoImporting, setPhotoImporting] = useState(false);",
  `  const [photoImporting, setPhotoImporting] = useState(false);\n  const [photoImportProgress, setPhotoImportProgress] = useState({\n    visible: false,\n    status: 'idle',\n    percent: 0,\n    label: '',\n    detail: '',\n    processed: 0,\n    total: 0,\n  });`,
  'photo progress state');

app = replaceOnce(app,
  "  useEffect(() => () => releaseAllPhotoRuntimeUrls(), []);",
  `  useEffect(() => () => {\n    releaseAllPhotoRuntimeUrls();\n    window.clearTimeout(photoProgressTimerRef.current);\n  }, []);`,
  'photo progress cleanup');

app = replaceOnce(app,
  `  async function uploadPhotos(event) {\n    const input = event.currentTarget;`,
  `  function showPhotoImportProgress({ status = 'active', percent = 0, label = '', detail = '', processed = 0, total = 0 }) {\n    window.clearTimeout(photoProgressTimerRef.current);\n    setPhotoImportProgress({\n      visible: true,\n      status,\n      percent: clamp(Math.round(Number(percent) || 0), 0, 100),\n      label,\n      detail,\n      processed,\n      total,\n    });\n  }\n\n  function finishPhotoImportProgress({ status = 'done', label, detail }) {\n    window.clearTimeout(photoProgressTimerRef.current);\n    setPhotoImportProgress((current) => ({\n      ...current,\n      visible: true,\n      status,\n      percent: status === 'done' ? 100 : current.percent,\n      label,\n      detail,\n    }));\n    photoProgressTimerRef.current = window.setTimeout(() => {\n      setPhotoImportProgress((current) => ({ ...current, visible: false }));\n    }, status === 'done' ? 2600 : 6500);\n  }\n\n  async function uploadPhotos(event) {\n    const input = event.currentTarget;`,
  'photo progress helpers');

app = replaceOnce(app,
  `    photoUploadInFlightRef.current = true;\n    setPhotoImporting(true);\n\n    try {\n      const prepared = await prepareLocalPhotoFiles(initialSelection.accepted, {\n        onProgress: ({ index, total, name }) => show(\`Преобразую HEIC: \${index + 1} из \${total} · \${name}\`),\n      });`,
  `    photoUploadInFlightRef.current = true;\n    setPhotoImporting(true);\n    const uploadTotal = initialSelection.accepted.length;\n    showPhotoImportProgress({\n      percent: 2,\n      label: 'Подготавливаю фото',\n      detail: \`0 из \${uploadTotal}\`,\n      processed: 0,\n      total: uploadTotal,\n    });\n\n    try {\n      const prepared = await prepareLocalPhotoFiles(initialSelection.accepted, {\n        onProgress: ({ index, total, name }) => {\n          const safeTotal = Math.max(1, total);\n          showPhotoImportProgress({\n            percent: 5 + (index / safeTotal) * 30,\n            label: 'Преобразую HEIC',\n            detail: \`\${index + 1} из \${total} · \${name}\`,\n            processed: index,\n            total,\n          });\n          show(\`Преобразую HEIC: \${index + 1} из \${total} · \${name}\`);\n        },\n      });`,
  'start progress before preparation');

app = replaceOnce(app,
  `      let loadedCount = 0;\n      let failedToStore = 0;\n      const chunkSize = 2;\n      for (let offset = 0; offset < selection.accepted.length; offset += chunkSize) {\n        const chunk = selection.accepted.slice(offset, offset + chunkSize);\n        const finish = Math.min(selection.accepted.length, offset + chunk.length);\n        show(\`Сохраняю фото: \${finish} из \${selection.accepted.length}\`);\n        const result = await persistPhotoFiles(chunk, { idFactory: makeId, maxConcurrent: 1 });`,
  `      let loadedCount = 0;\n      let failedToStore = 0;\n      const chunkSize = 2;\n      const storeTotal = selection.accepted.length;\n      showPhotoImportProgress({\n        percent: 35,\n        label: 'Сохраняю фото',\n        detail: \`0 из \${storeTotal}\`,\n        processed: 0,\n        total: storeTotal,\n      });\n      for (let offset = 0; offset < storeTotal; offset += chunkSize) {\n        const chunk = selection.accepted.slice(offset, offset + chunkSize);\n        const finish = Math.min(storeTotal, offset + chunk.length);\n        showPhotoImportProgress({\n          percent: 35 + (offset / Math.max(1, storeTotal)) * 65,\n          label: 'Сохраняю фото',\n          detail: \`\${offset + 1}–\${finish} из \${storeTotal}\`,\n          processed: offset,\n          total: storeTotal,\n        });\n        show(\`Сохраняю фото: \${finish} из \${storeTotal}\`);\n        const result = await persistPhotoFiles(chunk, { idFactory: makeId, maxConcurrent: 1 });`,
  'chunk progress start');

app = replaceOnce(app,
  `        if (result.loaded.length) {\n          setLibrary((current) => [...current, ...result.loaded].slice(0, MAX_LIBRARY_PHOTOS));\n        }\n        await new Promise((resolve) => requestAnimationFrame(() => resolve()));`,
  `        if (result.loaded.length) {\n          setLibrary((current) => [...current, ...result.loaded].slice(0, MAX_LIBRARY_PHOTOS));\n        }\n        showPhotoImportProgress({\n          percent: 35 + (finish / Math.max(1, storeTotal)) * 65,\n          label: 'Сохраняю фото',\n          detail: \`\${finish} из \${storeTotal}\`,\n          processed: finish,\n          total: storeTotal,\n        });\n        await new Promise((resolve) => requestAnimationFrame(() => resolve()));`,
  'chunk progress completion');

app = replaceOnce(app,
  `      const rejectedSuffix = rejected ? \` · пропущено: \${rejected}\` : '';\n      show(\`Фото загружены: \${loadedCount}\${duplicateSuffix}\${convertedSuffix}\${rejectedSuffix}\`);\n    } catch (error) {\n      console.warn('Photo import failed', error);\n      show(error?.message || 'Не удалось загрузить фотографии');`,
  `      const rejectedSuffix = rejected ? \` · пропущено: \${rejected}\` : '';\n      const resultMessage = \`Фото загружены: \${loadedCount}\${duplicateSuffix}\${convertedSuffix}\${rejectedSuffix}\`;\n      show(resultMessage);\n      finishPhotoImportProgress({\n        status: 'done',\n        label: 'Фото загружены',\n        detail: \`Готово: \${loadedCount} из \${storeTotal}\${unique.duplicates.length ? \` · повторы: \${unique.duplicates.length}\` : ''}\`,\n      });\n    } catch (error) {\n      console.warn('Photo import failed', error);\n      const errorMessage = error?.message || 'Не удалось загрузить фотографии';\n      show(errorMessage);\n      finishPhotoImportProgress({ status: 'error', label: 'Ошибка загрузки', detail: errorMessage });`,
  'finish progress state');

app = replaceOnce(app,
  `              <label className={\`upload-box \${photoImporting ? 'disabled-upload-box' : ''}\`}><strong>{photoImporting ? 'Загружаю фото…' : 'Загрузить фото'}</strong><small>{photoImporting ? 'Оригиналы сохраняются по очереди' : 'Можно сразу несколько'}</small><input type="file" accept="image/*" multiple disabled={photoImporting} onChange={uploadPhotos} /></label>\n              <button className="button full"`,
  `              <label className={\`upload-box \${photoImporting ? 'disabled-upload-box' : ''}\`}><strong>{photoImporting ? 'Загружаю фото…' : 'Загрузить фото'}</strong><small>{photoImporting ? 'Оригиналы сохраняются по очереди' : 'Можно сразу несколько'}</small><input type="file" accept="image/*" multiple disabled={photoImporting} onChange={uploadPhotos} /></label>\n              {photoImportProgress.visible && (\n                <div className={\`photo-upload-progress \${photoImportProgress.status}\`} aria-live="polite">\n                  <div className="photo-upload-progress-head">\n                    <strong>{photoImportProgress.label}</strong>\n                    <span>{photoImportProgress.percent}%</span>\n                  </div>\n                  <div\n                    className="photo-upload-progress-track"\n                    role="progressbar"\n                    aria-label={photoImportProgress.label || 'Загрузка фотографий'}\n                    aria-valuemin="0"\n                    aria-valuemax="100"\n                    aria-valuenow={photoImportProgress.percent}\n                    aria-valuetext={photoImportProgress.detail}\n                  >\n                    <i style={{ width: \`\${photoImportProgress.percent}%\` }} />\n                  </div>\n                  <small>{photoImportProgress.detail}</small>\n                </div>\n              )}\n              <button className="button full"`,
  'photo progress UI');

writeFileSync('src/AppLive.jsx', app);

let main = readFileSync('src/main.jsx', 'utf8');
main = replaceOnce(main,
  "import './editor-mobile-mode-fixes.css';",
  "import './editor-mobile-mode-fixes.css';\nimport './photo-upload-progress.css';",
  'progress css import');
writeFileSync('src/main.jsx', main);

writeFileSync('src/photo-upload-progress.css', `.photo-upload-progress {\n  display: grid;\n  gap: 8px;\n  padding: 12px 13px;\n  border: 1px solid rgba(47, 125, 82, 0.24);\n  border-radius: 14px;\n  background: rgba(244, 250, 246, 0.96);\n  box-shadow: 0 6px 18px rgba(36, 66, 50, 0.08);\n}\n\n.photo-upload-progress-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; }\n.photo-upload-progress-head strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }\n.photo-upload-progress-head span { flex: 0 0 auto; font-size: 13px; font-weight: 800; font-variant-numeric: tabular-nums; }\n.photo-upload-progress-track { position: relative; height: 11px; overflow: hidden; border-radius: 999px; background: rgba(47, 125, 82, 0.14); }\n.photo-upload-progress-track i { display: block; width: 0; height: 100%; border-radius: inherit; background: #2f7d52; transition: width 180ms ease-out; }\n.photo-upload-progress > small { overflow: hidden; color: #59665f; font-size: 12px; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }\n.photo-upload-progress.done { border-color: rgba(47, 125, 82, 0.38); background: rgba(239, 249, 242, 0.98); }\n.photo-upload-progress.error { border-color: rgba(166, 61, 61, 0.34); background: rgba(255, 244, 244, 0.98); }\n.photo-upload-progress.error .photo-upload-progress-track { background: rgba(166, 61, 61, 0.14); }\n.photo-upload-progress.error .photo-upload-progress-track i { background: #a63d3d; }\n@media (max-width: 760px) { .photo-upload-progress { padding: 10px 11px; border-radius: 12px; } .photo-upload-progress > small { white-space: normal; } }\n@media (prefers-reduced-motion: reduce) { .photo-upload-progress-track i { transition: none; } }\n`);

writeFileSync('e2e/photo-upload-progress.spec.js', `import { expect, test } from '@playwright/test';\nimport { openEditor, TINY_PNG_BASE64 } from './helpers.mjs';\n\ntest('shows percentage and a progress bar while a HEIC photo is processed', async ({ page }) => {\n  await page.route('**/api/heic/convert?*', async (route) => {\n    await new Promise((resolve) => setTimeout(resolve, 350));\n    await route.fulfill({ status: 200, contentType: 'image/jpeg', body: Buffer.from(TINY_PNG_BASE64, 'base64') });\n  });\n\n  await openEditor(page);\n  const input = page.locator('.upload-box input[type="file"][accept="image/*"]');\n  await input.setInputFiles({ name: 'IMG_PROGRESS.HEIC', mimeType: 'image/heic', buffer: Buffer.from('fake-heic-progress-payload') });\n\n  const progress = page.locator('.photo-upload-progress');\n  await expect(progress).toBeVisible();\n  await expect(progress).toContainText('Преобразую HEIC');\n  const bar = progress.getByRole('progressbar');\n  await expect(bar).toHaveAttribute('aria-valuemax', '100');\n  await expect(progress.locator('.photo-upload-progress-head span')).toContainText('%');\n\n  await expect.poll(() => page.evaluate(() => window.__collageApp?.getProject?.().library?.length || 0)).toBe(1);\n  await expect(progress).toHaveClass(/done/);\n  await expect(bar).toHaveAttribute('aria-valuenow', '100');\n  await expect(progress).toContainText('Готово: 1 из 1');\n});\n`);

console.log('Applied photo upload progress UI');
