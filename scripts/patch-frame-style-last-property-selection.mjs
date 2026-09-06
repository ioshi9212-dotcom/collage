import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(source, before, after, label) {
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`Missing patch anchor: ${label}`);
  if (source.indexOf(before, index + before.length) >= 0) throw new Error(`Patch anchor is not unique: ${label}`);
  return source.slice(0, index) + after + source.slice(index + before.length);
}

const appPath = 'src/AppLive.jsx';
let app = readFileSync(appPath, 'utf8');
app = replaceOnce(
  app,
  "  useEffect(() => {\n    setLastFrameStyleChange(null);\n    if (!selectedFrame) return;\n    setFrameStyleDraft(normalizeFrameStyle(selectedFrame, settings));\n  }, [selectedFrame, settings]);",
  "  useEffect(() => {\n    if (!selectedFrame) return;\n    setFrameStyleDraft(normalizeFrameStyle(selectedFrame, settings));\n  }, [selectedFrame, settings]);\n\n  useEffect(() => {\n    setLastFrameStyleChange(null);\n  }, [selectedFrameId]);",
  'reset last property only on frame selection',
);
writeFileSync(appPath, app);

const e2ePath = 'e2e/frame-style-controls.spec.js';
let e2e = readFileSync(e2ePath, 'utf8');
e2e = replaceOnce(
  e2e,
  "  await page.getByLabel('Скругление').fill('120');\n  const applyAll = page.getByRole('button', { name: 'Применить ко всем', exact: true });\n  await expect(applyAll).toBeEnabled();\n  await expect(page.getByText('Только: скругление', { exact: true })).toBeVisible();\n  await applyAll.click();",
  "  await page.getByLabel('Скругление').fill('120');\n  const applyAll = page.getByRole('button', { name: 'Применить ко всем', exact: true });\n  await expect(applyAll).toBeEnabled();\n  await expect(page.getByText('Только: скругление', { exact: true })).toBeVisible();\n\n  // Applying to the selected frame first must not forget which property the user changed.\n  await page.getByRole('button', { name: 'Применить оформление', exact: true }).click();\n  await expect(applyAll).toBeEnabled();\n  await expect(page.getByText('Только: скругление', { exact: true })).toBeVisible();\n  await applyAll.click();",
  'preserve last property after selected-frame apply',
);
writeFileSync(e2ePath, e2e);
console.log('Last frame style property now resets only when selection changes');
