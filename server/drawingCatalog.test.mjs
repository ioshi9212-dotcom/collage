import assert from 'node:assert/strict';
import { drawingCatalogAsset, normalizeDrawingCatalogDimensions, normalizeDrawingCatalogKey } from './drawingCatalog.js';
assert.equal(normalizeDrawingCatalogKey(7, '/users/7/photos/a/original.png'), 'users/7/photos/a/original.png');
assert.equal(normalizeDrawingCatalogKey(7, 'users/8/photos/a/original.png'), '');
assert.equal(normalizeDrawingCatalogKey(7, 'users/7/photos/../secret.png'), '');
assert.deepEqual(normalizeDrawingCatalogDimensions(400.4, 900.6), { width: 400, height: 901 });
assert.deepEqual(drawingCatalogAsset({ id: 'x', object_key: 'users/7/photos/a/original.png', name: 'Ветка', width_px: 100, height_px: 50 }), { id: 'x', name: 'Ветка', cloudKey: 'users/7/photos/a/original.png', src: '/api/photo-assets/file?key=users%2F7%2Fphotos%2Fa%2Foriginal.png', width: 100, height: 50, createdAt: null });
console.log('drawing catalog server checks passed');
