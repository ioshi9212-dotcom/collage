import { buildGridLayout } from './layout.js';
import { settingsForPage } from './pageModel.js';
import { createFreeFrame, removeFrameById } from './frameModel.js';

export function addFreeFrameToPage(page, canvas, settings, idFactory) {
  if (!page || page.isBlankPage) return { page, frame: null };
  const frames = Array.isArray(page.frames) ? page.frames : [];
  const frame = createFreeFrame(frames, canvas, idFactory);
  const nextFrames = [...frames, frame];
  const frameCount = nextFrames.length;
  const pageSettings = settingsForPage(settings, page, frameCount);
  const layout = buildGridLayout(canvas, pageSettings, nextFrames).layout;
  return {
    frame,
    page: { ...page, frameCount, layout, frames: nextFrames },
  };
}

export function removeFreeFrameFromPage(page, frameId, canvas, settings) {
  if (!page || page.isBlankPage) return page;
  const nextFrames = removeFrameById(page.frames, frameId);
  const frameCount = nextFrames.length;
  const layout = frameCount > 0
    ? buildGridLayout(canvas, settingsForPage(settings, page, frameCount), nextFrames).layout
    : null;
  return { ...page, frameCount, layout, frames: nextFrames };
}
