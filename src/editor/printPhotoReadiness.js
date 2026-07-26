export function printPhotoIdentity(page, frame) {
  const pageId = page?.id == null ? 'page' : String(page.id);
  const frameId = frame?.id == null ? 'frame' : String(frame.id);
  return `${pageId}:${frameId}`;
}

export function buildPrintPhotoReferences(page) {
  return (page?.frames ?? [])
    .filter((frame) => frame?.photo)
    .map((frame) => ({
      identity: printPhotoIdentity(page, frame),
      name: frame.photo?.name || 'Фото',
      src: frame.photo?.src || '',
    }));
}

export function printPhotoNodesReady(references, renderedPhotos) {
  if (!Array.isArray(references) || !Array.isArray(renderedPhotos)) return false;
  if (references.length !== renderedPhotos.length) return false;

  const expected = new Map();
  for (const reference of references) {
    if (!reference?.identity || !reference?.src || expected.has(reference.identity)) return false;
    expected.set(reference.identity, reference.src);
  }

  for (const rendered of renderedPhotos) {
    if (!rendered?.ready || !rendered?.identity || !rendered?.src) return false;
    if (expected.get(rendered.identity) !== rendered.src) return false;
    expected.delete(rendered.identity);
  }

  return expected.size === 0;
}
