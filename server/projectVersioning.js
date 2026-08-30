export function parseTitleVersion(title) {
  const value = String(title || '').trim();
  const match = value.match(/^(.+)\.(\d+)$/);
  if (match) {
    const version = Number.parseInt(match[2], 10);
    if (version >= 2) return { base: match[1], version };
  }
  return { base: value, version: null };
}

export function getTitleBase(title) {
  return parseTitleVersion(title).base;
}

export function isSameFamily(left, right) {
  return getTitleBase(left) === getTitleBase(right);
}

export function getNextVersionTitle(currentTitle, existingTitles = []) {
  const base = getTitleBase(currentTitle) || 'Без названия';
  let foundFamily = false;
  let maxVersion = 1;

  for (const title of existingTitles) {
    const parsed = parseTitleVersion(title);
    if (parsed.base !== base) continue;
    foundFamily = true;
    maxVersion = Math.max(maxVersion, parsed.version || 1);
  }

  return foundFamily ? `${base}.${maxVersion + 1}` : base;
}
