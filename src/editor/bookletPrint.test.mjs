import assert from 'node:assert/strict';
import { buildBookletPlan } from './booklet.js';
import {
  BOOKLET_BACK_ORDER_REVERSE,
  BOOKLET_BACK_ORDER_SAME,
  BOOKLET_HALF_SHEET_WIDTH_MM,
  buildBookletPrintInstructions,
  buildManualDuplexBookletOrder,
  estimateFoldedBlockThicknessMm,
  getA4BookletPrintGeometry,
  normalizeHomeBookletPrintSettings,
  shouldRotateBookletSide,
} from './bookletPrint.js';

const geometry = getA4BookletPrintGeometry({
  canvas: { width: 1480, height: 2100 },
  settings: { presetId: 'a5-portrait', printDpi: 300 },
});
assert.equal(geometry.trimWidthMm, 297);
assert.equal(geometry.trimHeightMm, 210);
assert.equal(geometry.slotWidthMm, BOOKLET_HALF_SHEET_WIDTH_MM);
assert.equal(geometry.outputWidthPx, 3508);
assert.equal(geometry.outputHeightPx, 2480);
assert.equal(geometry.bleedMm, 0);
assert.equal(geometry.outputWidthPx, geometry.trimWidthPx);
assert.equal(geometry.outputHeightPx, geometry.trimHeightPx);
assert.ok(geometry.renderPixelRatio > 1.18 && geometry.renderPixelRatio < 1.19);

const plan = buildBookletPlan({ pageCount: 8, sheetsPerBlock: 2 });
const reverseOrder = buildManualDuplexBookletOrder(plan, {
  backOrder: BOOKLET_BACK_ORDER_REVERSE,
});
assert.deepEqual(reverseOrder.fronts.map((side) => [side.left.pageNumber, side.right.pageNumber]), [
  [8, 1],
  [6, 3],
]);
assert.deepEqual(reverseOrder.backs.map((side) => [side.left.pageNumber, side.right.pageNumber]), [
  [4, 5],
  [2, 7],
]);
assert.deepEqual(reverseOrder.combined.map((side) => side.id), [
  plan.blocks[0].sheets[0].front.id,
  plan.blocks[0].sheets[0].back.id,
  plan.blocks[0].sheets[1].front.id,
  plan.blocks[0].sheets[1].back.id,
]);
assert.equal(reverseOrder.test.length, 2);

const sameOrder = buildManualDuplexBookletOrder(plan, {
  backOrder: BOOKLET_BACK_ORDER_SAME,
});
assert.deepEqual(sameOrder.backs.map((side) => [side.left.pageNumber, side.right.pageNumber]), [
  [2, 7],
  [4, 5],
]);

assert.equal(shouldRotateBookletSide(plan.sides[0], { rotateBack180: true }), false);
assert.equal(shouldRotateBookletSide(plan.sides[1], { rotateBack180: true }), true);
assert.equal(shouldRotateBookletSide(plan.sides[1], { rotateBack180: false }), false);

assert.deepEqual(normalizeHomeBookletPrintSettings({ backOrder: 'unexpected', paperThicknessMm: 9 }), {
  showFoldLine: false,
  backOrder: BOOKLET_BACK_ORDER_REVERSE,
  rotateBack180: false,
  paperThicknessMm: 0.5,
});
assert.equal(estimateFoldedBlockThicknessMm(4, { paperThicknessMm: 0.12 }), 0.96);

const instructions = buildBookletPrintInstructions({
  plan,
  settings: { backOrder: BOOKLET_BACK_ORDER_REVERSE, rotateBack180: true },
  dpi: 300,
});
assert.match(instructions, /A4 горизонтально, 297×210 мм, 300 DPI/);
assert.match(instructions, /Фактический размер \/ 100%/);
assert.match(instructions, /в обратном порядке/);
assert.match(instructions, /развёрнут на 180°/);
assert.match(instructions, /тест первого листа/);

console.log('booklet print tests passed');
