import assert from 'node:assert/strict';
import {
  buildCloudProject,
  cloudKeyFromPhoto,
  cloudLibraryItem,
  normalizeCloudPhoto,
  photoAssetUrl,
} from './cloudPhotoModel.js';

const key = 'users/7/photos/a/original.jpg';
assert.equal(photoAssetUrl(key), `/api/photo-assets/file?key=${encodeURIComponent(key)}`);
assert.equal(cloudKeyFromPhoto({ src: photoAssetUrl(key) }), key);
const photo = normalizeCloudPhoto({ id: 'p1', name: 'one.jpg', assetId: 'local-a' }, {
  id: 'p1', name: 'one.jpg', type: 'image/jpeg', size: 1234, cloudKey: key,
});
assert.equal(photo.cloudKey, key);
assert.equal(photo.src, photoAssetUrl(key));
const cloudItem = cloudLibraryItem(photo);
assert.equal(cloudItem.assetId, undefined);
assert.equal(cloudItem.cloudKey, key);

const project = buildCloudProject({
  pages: [{ id: 'page-1', frames: [{ id: 'frame-1', photo: { id: 'p1', zoom: 1.2 } }] }],
  library: [],
}, [cloudItem]);
assert.equal(project.version, 'live-25-railway-bucket-photos');
assert.equal(project.pages[0].frames[0].photo.cloudKey, key);
assert.equal(project.pages[0].frames[0].photo.src, undefined);
assert.equal(project.pages[0].frames[0].photo.zoom, 1.2);
assert.doesNotMatch(JSON.stringify(project), /data:image|blob:/);
console.log('cloudPhotoModel tests passed');
