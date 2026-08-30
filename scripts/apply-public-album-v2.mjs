import { readFileSync, writeFileSync } from 'node:fs';

const decode = (value) => Buffer.from(value, 'base64').toString('utf8');
const replacements = [{"file":"src/AppLive.jsx","before":"aW1wb3J0IHsgc2F2ZUNsb3VkUHJvamVjdCB9IGZyb20gJy4vZWRpdG9yL2Nsb3VkUHJvamVjdHMnOw==","after":"aW1wb3J0IHsgc2F2ZUNsb3VkUHJvamVjdCB9IGZyb20gJy4vZWRpdG9yL2Nsb3VkUHJvamVjdHMnOwppbXBvcnQgUHVibGljQWxidW1TaGFyZUNvbnRyb2wgZnJvbSAnLi9lZGl0b3IvUHVibGljQWxidW1TaGFyZUNvbnRyb2wnOw=="},{"file":"src/AppLive.jsx","before":"ICAgICAgICAgIDxidXR0b24gY2xhc3NOYW1lPVwiYnV0dG9uIHByaW1hcnktc2F2ZS12MlwiIHR5cGU9XCJidXR0b25cIiBkaXNhYmxlZD17c2F2aW5nfSBvbkNsaWNrPXtzYXZlfT57c2F2aW5nID8gJ9Ch0L7RhdGA0LDQvdGP0Y7igKYnIDogJ9Ch0L7RhdGA0LDQvdC40YLRjCd9PC9idXR0b24+","after":"ICAgICAgICAgIDxQdWJsaWNBbGJ1bVNoYXJlQ29udHJvbCBzYXZlUHJvamVjdD17c2F2ZX0gc2hvd05vdGljZT17c2hvd30gLz4KICAgICAgICAgIDxidXR0b24gY2xhc3NOYW1lPVwiYnV0dG9uIHByaW1hcnktc2F2ZS12MlwiIHR5cGU9XCJidXR0b25cIiBkaXNhYmxlZD17c2F2aW5nfSBvbkNsaWNrPXtzYXZlfT57c2F2aW5nID8gJ9Ch0L7RhdGA0LDQvdGP0Y7igKYnIDogJ9Ch0L7RhdGA0LDQvdC40YLRjCd9PC9idXR0b24+"},{"file":"src/editor/AlbumFlipPreview.jsx","before":"ICByZW5kZXJQYWdlLAogIG9uQ2xvc2UsCn0pIHs=","after":"ICByZW5kZXJQYWdlLAogIG9uQ2xvc2UsCiAgc3RhbmRhbG9uZSA9IGZhbHNlLAp9KSB7"},{"file":"src/editor/AlbumFlipPreview.jsx","before":"ICAgICAgaWYgKGV2ZW50LmtleSA9PT0gJ0VzY2FwZScpIG9uQ2xvc2U/LigpOw==","after":"ICAgICAgaWYgKGV2ZW50LmtleSA9PT0gJ0VzY2FwZScgJiYgIXN0YW5kYWxvbmUpIG9uQ2xvc2U/LigpOw=="},{"file":"src/editor/AlbumFlipPreview.jsx","before":"ICB9LCBbb3Blbiwgb25DbG9zZV0pOw==","after":"ICB9LCBbb3Blbiwgb25DbG9zZSwgc3RhbmRhbG9uZV0pOw=="},{"file":"src/editor/AlbumFlipPreview.jsx","before":"ICAgIDxkaXYgY2xhc3NOYW1lPVwiYWxidW0tZmxpcC1vdmVybGF5XCIgcm9sZT1cImRpYWxvZ1wiIGFyaWEtbW9kYWw9XCJ0cnVlXCIgYXJpYS1sYWJlbD1cItCf0YDQvtGB0LzQvtGC0YAg0LDQu9GM0LHRg9C80LBcIj4=","after":"ICAgIDxkaXYgY2xhc3NOYW1lPXtgYGFsYnVtLWZsaXAtb3ZlcmxheSAke3N0YW5kYWxvbmUgPyAnYWxidW0tZmxpcC1zdGFuZGFsb25lJyA6ICcnfWB9IHJvbGU9e3N0YW5kYWxvbmUgPyAncmVnaW9uJyA6ICdkaWFsb2cnfSBhcmlhLW1vZGFsPXtzdGFuZGFsb25lID8gdW5kZWZpbmVkIDogdHJ1ZX0gYXJpYS1sYWJlbD1cItCf0YDQvtGB0LzQvtGC0YAg0LDQu9GM0LHRg9C80LBcIj4="},{"file":"src/editor/AlbumFlipPreview.jsx","before":"ICAgICAgICAgIDxidXR0b24gdHlwZT1cImJ1dHRvblwiIGNsYXNzTmFtZT1cImFsYnVtLWZsaXAtY2xvc2VcIiBvbkNsaWNrPXtvbkNsb3NlfSBhcmlhLWxhYmVsPVwi0JfQsNC60YDRi9GC0Ywg0L/RgNC+0YHQvNC+0YLRgFwiPsOXPC9idXR0b24+","after":"ICAgICAgICAgIHshc3RhbmRhbG9uZSAmJiA8YnV0dG9uIHR5cGU9XCJidXR0b25cIiBjbGFzc05hbWU9XCJhbGJ1bS1mbGlwLWNsb3NlXCIgb25DbGljaz17b25DbG9zZX0gYXJpYS1sYWJlbD1cItCX0LDQutGA0YvRgtGMINC/0YDQvtGB0LzQvtGC0YBcIj7DlzwvYnV0dG9uPn0="},{"file":"server.js","before":"aW1wb3J0IHsgY3JlYXRlSGVpY0NvbnZlcnNpb25IYW5kbGVyIH0gZnJvbSAnLi9zZXJ2ZXIvaGVpY0NvbnZlcnNpb24uanMnOw==","after":"aW1wb3J0IHsgY3JlYXRlSGVpY0NvbnZlcnNpb25IYW5kbGVyIH0gZnJvbSAnLi9zZXJ2ZXIvaGVpY0NvbnZlcnNpb24uanMnOwppbXBvcnQgewogIGVuc3VyZVB1YmxpY0FsYnVtU2NoZW1hLAogIGhhbmRsZVB1YmxpY0FsYnVtUmVxdWVzdCwKfSBmcm9tICcuL3NlcnZlci9wdWJsaWNBbGJ1bVJvdXRlcy5qcyc7"},{"file":"server.js","before":"ICAgIGApLnRoZW4oYXN5bmMgKCkgPT4gewogICAgICB0cnkgew==","after":"ICAgIGApLnRoZW4oYXN5bmMgKCkgPT4gewogICAgICBhd2FpdCBlbnN1cmVQdWJsaWNBbGJ1bVNjaGVtYShwb29sKTsKICAgICAgdHJ5IHs="},{"file":"server.js","before":"ICBjb25zdCBtZXRob2QgPSByZXF1ZXN0Lm1ldGhvZCB8fCAnR0VUJzsKCiAgaWYgKG1ldGhvZCA9PT0gJ0dFVCcgJiYgcGF0aCA9PT0gJy9hcGkvaGVhbHRoJykgew==","after":"ICBjb25zdCBtZXRob2QgPSByZXF1ZXN0Lm1ldGhvZCB8fCAnR0VUJzsKCiAgaWYgKGF3YWl0IGhhbmRsZVB1YmxpY0FsYnVtUmVxdWVzdCh7CiAgICByZXF1ZXN0LAogICAgcmVzcG9uc2UsCiAgICBwb29sLAogICAgcGhvdG9Bc3NldEdhdGV3YXksCiAgICByZXF1aXJlVXNlciwKICAgIHJlYWRCb2R5LAogICAgYXV0aEpzb25MaW1pdEJ5dGVzLAogIH0pKSB7CiAgICByZXR1cm4gdHJ1ZTsKICB9CgogIGlmIChtZXRob2QgPT09ICdHRVQnICYmIHBhdGggPT09ICcvYXBpL2hlYWx0aCcpIHs="}];

for (const [index, operation] of replacements.entries()) {
  const before = decode(operation.before);
  const after = decode(operation.after);
  const source = readFileSync(operation.file, 'utf8');
  const first = source.indexOf(before);
  console.log(`Applying ${index + 1}/${replacements.length}: ${operation.file}`);
  if (first < 0) throw new Error(`Expected source not found in ${operation.file} at operation ${index + 1}`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Expected source is not unique in ${operation.file} at operation ${index + 1}`);
  }
  writeFileSync(operation.file, source.slice(0, first) + after + source.slice(first + before.length));
}

const packagePath = 'package.json';
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
for (const command of ['node server/publicAlbums.test.mjs', 'node src/editor/publicAlbum.test.mjs']) {
  if (!packageJson.scripts.test.includes(command)) packageJson.scripts.test += ` && ${command}`;
}
writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
console.log('Public album sharing migration v2 applied.');
