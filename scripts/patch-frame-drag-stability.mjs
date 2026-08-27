import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const appPath = 'src/AppLive.jsx';
const testPath = 'e2e/smart-frame-snapping.spec.js';
let app = readFileSync(appPath, 'utf8');
let test = readFileSync(testPath, 'utf8');

function replaceOnce(source, before, after, label) {
  assert.ok(source.includes(before), `Cannot patch ${label}: source pattern not found`);
  return source.replace(before, after);
}

app = replaceOnce(
  app,
  `      draggable={!printMode && selected}\n      onMouseDown={(event) => { event.cancelBubble = true; onSelect(); }}\n      onTap={(event) => { event.cancelBubble = true; onSelect(); }}\n      onDragStart={(event) => { event.cancelBubble = true; }}`,
  `      draggable={!printMode && selected}\n      onMouseDown={(event) => {\n        if (selected) event.cancelBubble = true;\n        onSelect();\n      }}\n      onTap={(event) => {\n        if (selected) event.cancelBubble = true;\n        onSelect();\n      }}\n      onDragStart={(event) => { event.cancelBubble = true; }}`,
  'photo pointer handoff',
);

app = replaceOnce(
  app,
  `  const canDragFrame = !collagePreviewOnly && !printMode && selected && !locked;`,
  `  const canDragFrame = !collagePreviewOnly && !printMode && !locked;`,
  'stable draggable state',
);

app = replaceOnce(
  app,
  `  function clampFrameNode(node) {\n    const bounded = clampFramePosition(frame, canvas, node.x(), node.y());\n    if (!smartSnap) {\n      node.x(bounded.x);\n      node.y(bounded.y);\n      clearSnapGuides();\n      return bounded;\n    }\n    const snapped = snapFramePosition({\n      frame,\n      frames: snapFrames,\n      canvas,\n      x: bounded.x,\n      y: bounded.y,\n    });\n    node.x(snapped.x);\n    node.y(snapped.y);\n    onSnapGuidesChange(hasFrameSnapGuides(snapped.guides) ? snapped.guides : null);\n    return snapped;\n  }\n\n  function commitFrameDrag(event) {\n    if (collagePreviewOnly || printMode || !selected || locked) return;\n    const node = event.target;\n    clampFrameNode(node);\n    onFrameChange(frame.id, { x: node.x(), y: node.y() });\n    clearSnapGuides();\n    onFrameDragFinish?.();\n  }`,
  `  function clampFrameNode(node, applySnap = false) {\n    const bounded = clampFramePosition(frame, canvas, node.x(), node.y());\n    if (!smartSnap) {\n      node.x(bounded.x);\n      node.y(bounded.y);\n      clearSnapGuides();\n      return bounded;\n    }\n    const snapped = snapFramePosition({\n      frame,\n      frames: snapFrames,\n      canvas,\n      x: bounded.x,\n      y: bounded.y,\n    });\n    const next = applySnap ? snapped : bounded;\n    node.x(next.x);\n    node.y(next.y);\n    onSnapGuidesChange(hasFrameSnapGuides(snapped.guides) ? snapped.guides : null);\n    return next;\n  }\n\n  function commitFrameDrag(event) {\n    if (collagePreviewOnly || printMode || locked) return;\n    const node = event.target;\n    clampFrameNode(node, true);\n    onFrameChange(frame.id, { x: node.x(), y: node.y() });\n    clearSnapGuides();\n    onFrameDragFinish?.();\n  }`,
  'smooth drag and snap on release',
);

app = replaceOnce(
  app,
  `        onMouseDown={onSelect}\n        onTap={onSelect}\n        onDragMove={(event) => {\n          if (!canDragFrame) return;\n          clampFrameNode(event.target);\n        }}\n        onDragEnd={commitFrameDrag}`,
  `        onMouseDown={onSelect}\n        onTap={onSelect}\n        onDragStart={(event) => {\n          event.cancelBubble = true;\n          onSelect();\n          clearSnapGuides();\n        }}\n        onDragMove={(event) => {\n          if (!canDragFrame) return;\n          clampFrameNode(event.target, false);\n        }}\n        onDragEnd={commitFrameDrag}`,
  'first-gesture frame drag',
);

const marker = `test('smart alignment softly snaps frame edges and can be disabled', async ({ page }) => {`;
assert.ok(test.includes(marker), 'smart frame snapping test marker missing');

if (!test.includes("free frame can be dragged on the first gesture without sticky selection handoff")) {
  test += `\n\ntest('free frame can be dragged on the first gesture without sticky selection handoff', async ({ page }) => {\n  await openEditor(page);\n  await page.locator('.app-view-switch-v2').getByRole('button', { name: 'Страница', exact: true }).click();\n  await page.locator('.editor-tool-button-v2[aria-label=\"Коллаж\"]').click();\n\n  const snapButton = page.getByRole('button', { name: 'Умная привязка', exact: true });\n  if (await snapButton.evaluate((node) => node.classList.contains('active-mode'))) await snapButton.click();\n\n  const initial = await currentPage(page);\n  const frame = initial.frames[0];\n  await dragFrameBy(page, frame, 90, 60);\n\n  await expect.poll(async () => {\n    const next = await currentPage(page);\n    const moved = next.frames.find((item) => item.id === frame.id);\n    return { x: moved?.x, y: moved?.y };\n  }).toEqual({ x: frame.x + 90, y: frame.y + 60 });\n});\n`;
}

writeFileSync(appPath, app);
writeFileSync(testPath, test);
console.log('Frame drag stability patch applied');
