export function normalizeDrawingCatalogKey(userId, value) {
  const key = String(value || '').replace(/^\/+/, '');
  const prefix = 'users/' + Number(userId) + '/photos/';
  return key.startsWith(prefix) && !key.includes('..') ? key : '';
}

export function normalizeDrawingCatalogDimensions(width, height) {
  return {
    width: Math.max(1, Math.min(20_000, Math.round(Number(width) || 1))),
    height: Math.max(1, Math.min(20_000, Math.round(Number(height) || 1))),
  };
}

export function drawingCatalogAsset(row) {
  if (!row) return null;
  const key = String(row.object_key || row.cloudKey || '');
  return {
    id: String(row.id || ''),
    name: String(row.name || 'PNG-рисунок'),
    cloudKey: key,
    src: '/api/photo-assets/file?key=' + encodeURIComponent(key),
    width: Math.max(1, Number(row.width_px ?? row.width) || 1),
    height: Math.max(1, Number(row.height_px ?? row.height) || 1),
    createdAt: row.created_at || row.createdAt || null,
  };
}
