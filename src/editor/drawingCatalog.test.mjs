import test from 'node:test';
import assert from 'node:assert/strict';
import { hasPngSignature, isPngDrawingCandidate } from './drawingCatalog.js';

const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function namedBlob(bytes, { name = 'drawing.png', type = '' } = {}) {
  const blob = new Blob([bytes], { type });
  Object.defineProperty(blob, 'name', { value: name, configurable: true });
  return blob;
}

test('accepts PNG filename when browser leaves MIME empty', async () => {
  const file = namedBlob(PNG_SIGNATURE, { name: 'branch.png', type: '' });
  assert.equal(isPngDrawingCandidate(file), true);
  assert.equal(await hasPngSignature(file), true);
});

test('accepts regular image/png files', async () => {
  const file = namedBlob(PNG_SIGNATURE, { name: 'drawing', type: 'image/png' });
  assert.equal(isPngDrawingCandidate(file), true);
  assert.equal(await hasPngSignature(file), true);
});

test('rejects non-PNG content renamed to .png by signature', async () => {
  const file = namedBlob(new TextEncoder().encode('not actually a png'), { name: 'fake.png', type: '' });
  assert.equal(isPngDrawingCandidate(file), true);
  assert.equal(await hasPngSignature(file), false);
});

test('rejects unrelated file type and extension as a PNG candidate', () => {
  const file = namedBlob(PNG_SIGNATURE, { name: 'drawing.jpg', type: 'image/jpeg' });
  assert.equal(isPngDrawingCandidate(file), false);
});
