// Booklet imposition helpers for folded photo albums.
//
// This module is intentionally pure logic: no React, no Konva, no DOM.
// It converts normal album pages (1, 2, 3, ...) into physical print sheets.
//
// Example for 8 pages / 2 sheets per block:
//   sheet 1 front: [8][1]
//   sheet 1 back:  [2][7]
//   sheet 2 front: [6][3]
//   sheet 2 back:  [4][5]

export const BOOKLET_SIDE_FRONT = 'front';
export const BOOKLET_SIDE_BACK = 'back';
export const BOOKLET_POSITION_LEFT = 'left';
export const BOOKLET_POSITION_RIGHT = 'right';

export const BOOKLET_SIDE_LABELS = {
  [BOOKLET_SIDE_FRONT]: 'лицевая',
  [BOOKLET_SIDE_BACK]: 'оборот',
};

export const DEFAULT_SHEETS_PER_BLOCK = 2;
export const MIN_SHEETS_PER_BLOCK = 1;
export const MAX_SHEETS_PER_BLOCK = 8;

function toInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

export function clampBookletSheetsPerBlock(value) {
  return Math.max(
    MIN_SHEETS_PER_BLOCK,
    Math.min(MAX_SHEETS_PER_BLOCK, toInteger(value, DEFAULT_SHEETS_PER_BLOCK)),
  );
}

export function getBookletPagesPerBlock(sheetsPerBlock = DEFAULT_SHEETS_PER_BLOCK) {
  return clampBookletSheetsPerBlock(sheetsPerBlock) * 4;
}

export function getPaddedBookletPageCount(pageCount, sheetsPerBlock = DEFAULT_SHEETS_PER_BLOCK) {
  const safePageCount = Math.max(0, toInteger(pageCount, 0));
  if (safePageCount === 0) return 0;

  const pagesPerBlock = getBookletPagesPerBlock(sheetsPerBlock);
  return Math.ceil(safePageCount / pagesPerBlock) * pagesPerBlock;
}

function makeBookletSlot(pageNumber, originalPageCount) {
  const isBlank = pageNumber > originalPageCount || pageNumber < 1;
  return {
    pageNumber: isBlank ? null : pageNumber,
    sourcePageIndex: isBlank ? null : pageNumber - 1,
    isBlank,
    label: isBlank ? 'пусто' : String(pageNumber),
  };
}

function makeSide({
  blockIndex,
  sheetIndex,
  side,
  leftPageNumber,
  rightPageNumber,
  originalPageCount,
}) {
  const left = makeBookletSlot(leftPageNumber, originalPageCount);
  const right = makeBookletSlot(rightPageNumber, originalPageCount);
  const sheetNumber = sheetIndex + 1;
  const blockNumber = blockIndex + 1;

  return {
    id: `block-${blockNumber}-sheet-${sheetNumber}-${side}`,
    blockIndex,
    blockNumber,
    sheetIndex,
    sheetNumber,
    side,
    sideLabel: BOOKLET_SIDE_LABELS[side] ?? side,
    title: `Блок ${blockNumber} · лист ${sheetNumber} · ${BOOKLET_SIDE_LABELS[side] ?? side}`,
    left,
    right,
    slots: [
      { position: BOOKLET_POSITION_LEFT, ...left },
      { position: BOOKLET_POSITION_RIGHT, ...right },
    ],
  };
}

function addToPageMap(pageMap, sideData) {
  for (const slot of sideData.slots) {
    if (slot.isBlank || !slot.pageNumber) continue;

    const pair = sideData.slots.find((item) => item.position !== slot.position);

    pageMap[String(slot.pageNumber)] = {
      pageNumber: slot.pageNumber,
      blockIndex: sideData.blockIndex,
      blockNumber: sideData.blockNumber,
      sheetIndex: sideData.sheetIndex,
      sheetNumber: sideData.sheetNumber,
      side: sideData.side,
      sideLabel: sideData.sideLabel,
      position: slot.position,
      pairPageNumber: pair?.pageNumber ?? null,
      pairIsBlank: Boolean(pair?.isBlank),
      sideId: sideData.id,
    };
  }
}

export function buildBookletPlan({ pageCount, sheetsPerBlock = DEFAULT_SHEETS_PER_BLOCK } = {}) {
  const originalPageCount = Math.max(0, toInteger(pageCount, 0));
  const safeSheetsPerBlock = clampBookletSheetsPerBlock(sheetsPerBlock);
  const pagesPerBlock = getBookletPagesPerBlock(safeSheetsPerBlock);
  const paddedPageCount = getPaddedBookletPageCount(originalPageCount, safeSheetsPerBlock);
  const blockCount = paddedPageCount === 0 ? 0 : paddedPageCount / pagesPerBlock;

  const blocks = [];
  const sides = [];
  const pageMap = {};

  for (let blockIndex = 0; blockIndex < blockCount; blockIndex += 1) {
    const blockStartPage = blockIndex * pagesPerBlock + 1;
    const blockEndPage = blockStartPage + pagesPerBlock - 1;

    const block = {
      blockIndex,
      blockNumber: blockIndex + 1,
      sheetsPerBlock: safeSheetsPerBlock,
      pagesPerBlock,
      startPage: blockStartPage,
      endPage: blockEndPage,
      sheets: [],
    };

    for (let sheetIndex = 0; sheetIndex < safeSheetsPerBlock; sheetIndex += 1) {
      const front = makeSide({
        blockIndex,
        sheetIndex,
        side: BOOKLET_SIDE_FRONT,
        leftPageNumber: blockEndPage - sheetIndex * 2,
        rightPageNumber: blockStartPage + sheetIndex * 2,
        originalPageCount,
      });

      const back = makeSide({
        blockIndex,
        sheetIndex,
        side: BOOKLET_SIDE_BACK,
        leftPageNumber: blockStartPage + sheetIndex * 2 + 1,
        rightPageNumber: blockEndPage - sheetIndex * 2 - 1,
        originalPageCount,
      });

      const sheet = {
        id: `block-${blockIndex + 1}-sheet-${sheetIndex + 1}`,
        blockIndex,
        blockNumber: blockIndex + 1,
        sheetIndex,
        sheetNumber: sheetIndex + 1,
        front,
        back,
        sides: [front, back],
      };

      block.sheets.push(sheet);
      sides.push(front, back);
      addToPageMap(pageMap, front);
      addToPageMap(pageMap, back);
    }

    blocks.push(block);
  }

  return {
    pageCount: originalPageCount,
    paddedPageCount,
    blankPageCount: paddedPageCount - originalPageCount,
    sheetsPerBlock: safeSheetsPerBlock,
    pagesPerBlock,
    blockCount,
    blocks,
    sides,
    pageMap,
  };
}

export function findBookletSideForPage(plan, pageNumber) {
  const pageInfo = plan?.pageMap?.[String(pageNumber)];
  if (!pageInfo) return null;
  return plan.sides.find((side) => side.id === pageInfo.sideId) ?? null;
}

export function getBookletSide(plan, { blockIndex = 0, sheetIndex = 0, side = BOOKLET_SIDE_FRONT } = {}) {
  const block = plan?.blocks?.[blockIndex];
  const sheet = block?.sheets?.[sheetIndex];
  if (!sheet) return null;
  return side === BOOKLET_SIDE_BACK ? sheet.back : sheet.front;
}

export function getBookletSideIndex(plan, sideId) {
  if (!plan?.sides?.length) return -1;
  return plan.sides.findIndex((side) => side.id === sideId);
}

export function getAdjacentBookletSide(plan, sideId, delta) {
  const sides = plan?.sides ?? [];
  if (!sides.length) return null;

  const currentIndex = getBookletSideIndex(plan, sideId);
  const fallbackIndex = delta >= 0 ? 0 : sides.length - 1;
  const baseIndex = currentIndex < 0 ? fallbackIndex : currentIndex;
  const nextIndex = Math.max(0, Math.min(sides.length - 1, baseIndex + delta));

  return sides[nextIndex] ?? null;
}

export function formatBookletSide(sideData) {
  if (!sideData) return '';
  return `${sideData.title}: [${sideData.left.label}][${sideData.right.label}]`;
}
