export function normalizeAlbumPageCount(value) {
  const count = Math.floor(Number(value) || 0);
  return Math.max(0, count);
}

export function albumMaxSpread(pageCount) {
  const count = normalizeAlbumPageCount(pageCount);
  if (count <= 1) return 0;
  return Math.ceil((count - 1) / 2);
}

export function albumSpreadPages(spreadIndex, pageCount) {
  const count = normalizeAlbumPageCount(pageCount);
  const maxSpread = albumMaxSpread(count);
  const spread = Math.min(maxSpread, Math.max(0, Math.floor(Number(spreadIndex) || 0)));
  if (!count) return { spreadIndex: 0, left: null, right: null };
  if (spread === 0) return { spreadIndex: 0, left: null, right: 0 };
  const left = spread * 2 - 1;
  const right = spread * 2;
  return {
    spreadIndex: spread,
    left: left < count ? left : null,
    right: right < count ? right : null,
  };
}

export function albumSpreadForPage(pageIndex, pageCount) {
  const count = normalizeAlbumPageCount(pageCount);
  if (!count) return 0;
  const page = Math.min(count - 1, Math.max(0, Math.floor(Number(pageIndex) || 0)));
  return page === 0 ? 0 : Math.ceil(page / 2);
}

export function albumVisiblePageLabel(spreadIndex, pageCount) {
  const { left, right } = albumSpreadPages(spreadIndex, pageCount);
  const visible = [left, right].filter((value) => value != null).map((value) => value + 1);
  if (!visible.length) return 'Нет страниц';
  if (visible.length === 1) return `Страница ${visible[0]}`;
  return `Страницы ${visible[0]}–${visible[1]}`;
}
