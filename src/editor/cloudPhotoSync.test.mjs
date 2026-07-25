import assert from 'node:assert/strict';
import {
  createCloudPhotoProject,
  mergeCloudMetadataIntoLibrary,
  mergeCloudPhotoMetadata,
} from './cloudPhotoSync.js';

const localBlob = new Blob(['photo-a'], { type: 'image/jpeg' });
const localProject = {
  version: 'local-test',
  library: [
    { id: 'photo-a', name: 'A.jpg', assetId: 'asset-a', assetSchema: 'indexeddb-blob-v1', type: 'image/jpeg', size: localBlob.size },
    { id: 'photo-b', name: 'B.jpg', cloudKey: 'users/7/photos/existing/original.jpg', cloudSchema: 'railway-bucket-v1', src: '/api/photo-assets/file?key=users%2F7%2Fphotos%2Fexisting%2Foriginal.jpg' },
  ],
  pages: [{
    id: 'page-1',
    frames: [
      { id: 'frame-a', photo: { id: 'photo-a', name: 'A.jpg', zoom: 1.2 } },
      { id: 'frame-b', photo: { id: 'photo-b', name: 'B.jpg', zoom: 1 } },
    ],
  }],
};

let uploadCount = 0;
const progress = [];
const cloudProject = await createCloudPhotoProject(localProject, {
  maxConcurrent: 1,
  resolvePhotoBlob: async (photo) => photo.id === 'photo-a' ? localBlob : null,
  uploadPhotoBlob: async (blob, name) => {
    uploadCount += 1;
    assert.equal(blob, localBlob);
    assert.equal(name, 'A.jpg');
    return {
      id: 'photo-a',
      name,
      type: blob.type,
      size: blob.size,
      cloudKey: 'users/7/photos/new/original.jpg',
      cloudSchema: 'railway-bucket-v1',
      src: '/api/photo-assets/file?key=users%2F7%2Fphotos%2Fnew%2Foriginal.jpg',
    };
  },
  onProgress: (event) => progress.push(event),
});

assert.equal(uploadCount, 1, 'already uploaded photos must not be uploaded again');
assert.equal(cloudProject.version, 'live-25-railway-bucket-photos');
assert.equal(cloudProject.library.length, 2);
assert.equal(cloudProject.library[0].cloudKey, 'users/7/photos/new/original.jpg');
assert.equal(cloudProject.library[1].cloudKey, 'users/7/photos/existing/original.jpg');
assert.ok(cloudProject.library.every((photo) => !String(photo.src || '').startsWith('data:')), 'cloud project must not contain Base64 photos');
assert.ok(JSON.stringify(cloudProject).length < 10_000, 'cloud payload should remain metadata-sized');
assert.equal(cloudProject.pages[0].frames[0].photo.cloudKey, 'users/7/photos/new/original.jpg');
assert.equal(cloudProject.pages[0].frames[0].photo.src, undefined, 'frame references should not duplicate photo URLs');
assert.ok(progress.some((event) => event.reused === true), 'reused cloud assets should report progress');

const merged = mergeCloudPhotoMetadata(localProject, cloudProject);
assert.equal(merged.library[0].assetId, 'asset-a', 'local IndexedDB reference must be preserved');
assert.equal(merged.library[0].cloudKey, 'users/7/photos/new/original.jpg');
assert.equal(merged.library[0].src, undefined, 'local compact project must not replace local asset with a network URL');
assert.equal(merged.pages[0].frames[0].photo.zoom, 1.2);
assert.equal(merged.pages[0].frames[0].photo.cloudKey, 'users/7/photos/new/original.jpg');
assert.equal(localProject.library[0].cloudKey, undefined, 'source project must stay unchanged');

const runtimeLibrary = [{ id: 'photo-a', assetId: 'asset-a', src: 'blob:local-a' }];
const mergedRuntime = mergeCloudMetadataIntoLibrary(runtimeLibrary, cloudProject);
assert.equal(mergedRuntime[0].src, 'blob:local-a', 'active local Blob URL must remain in use');
assert.equal(mergedRuntime[0].assetId, 'asset-a');
assert.equal(mergedRuntime[0].cloudKey, 'users/7/photos/new/original.jpg');

console.log('cloud photo sync checks passed');
