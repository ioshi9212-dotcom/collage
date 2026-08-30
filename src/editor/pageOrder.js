function validIndex(index, length) {
  return Number.isInteger(index) && index >= 0 && index < length;
}

function pageTitleForPosition(page, index) {
  const pageNumber = index + 1;
  const title = String(page?.title ?? '');
  const genericPattern = page?.isBlankPage ? /^Пустая страница \d+$/ : /^Страница \d+$/;
  if (!genericPattern.test(title)) return page;
  const nextTitle = page?.isBlankPage ? `Пустая страница ${pageNumber}` : `Страница ${pageNumber}`;
  return title === nextTitle ? page : { ...page, title: nextTitle };
}

export function pageNumberToIndex(value, pageCount) {
  const count = Number(pageCount);
  const number = Number(String(value ?? '').trim());
  if (!Number.isInteger(count) || count < 1) return null;
  if (!Number.isInteger(number) || number < 1 || number > count) return null;
  return number - 1;
}

export function moveArrayItem(items, fromIndex, toIndex) {
  if (!Array.isArray(items)) return [];
  if (!validIndex(fromIndex, items.length) || !validIndex(toIndex, items.length) || fromIndex === toIndex) return items;
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

export function swapArrayItems(items, firstIndex, secondIndex) {
  if (!Array.isArray(items)) return [];
  if (!validIndex(firstIndex, items.length) || !validIndex(secondIndex, items.length) || firstIndex === secondIndex) return items;
  const next = [...items];
  [next[firstIndex], next[secondIndex]] = [next[secondIndex], next[firstIndex]];
  return next;
}

export function normalizePageOrderTitles(pages) {
  if (!Array.isArray(pages)) return [];
  let changed = false;
  const next = pages.map((page, index) => {
    const normalized = pageTitleForPosition(page, index);
    if (normalized !== page) changed = true;
    return normalized;
  });
  return changed ? next : pages;
}

export function movePageOrder(pages, fromIndex, toIndex) {
  const moved = moveArrayItem(pages, fromIndex, toIndex);
  return normalizePageOrderTitles(moved);
}

export function swapPageOrder(pages, firstIndex, secondIndex) {
  const swapped = swapArrayItems(pages, firstIndex, secondIndex);
  return normalizePageOrderTitles(swapped);
}
