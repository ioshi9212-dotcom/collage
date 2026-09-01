import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const appPath = 'src/AppLive.jsx';
let app = readFileSync(appPath, 'utf8');

function replaceOnce(source, before, after, label) {
  assert.ok(source.includes(before), `Cannot patch ${label}: source pattern not found`);
  const next = source.replace(before, after);
  assert.notEqual(next, source, `Cannot patch ${label}: replacement made no change`);
  return next;
}

app = replaceOnce(
  app,
  `\n\nfunction formatNumberDraft(value, fallback = 0) {`,
  `\n\nfunction frameAtLocation(pages, pageId, frameId) {\n  const page = (Array.isArray(pages) ? pages : []).find((item) => item?.id === pageId);\n  return page?.frames?.find((frame) => frame?.id === frameId) ?? null;\n}\n\nfunction photoForFrameTransfer(photo, sourceFrame, targetFrame) {\n  if (!photo) return null;\n  const next = cloneDeep(photo);\n  const sourceWidth = Math.round(Number(sourceFrame?.width) || 0);\n  const sourceHeight = Math.round(Number(sourceFrame?.height) || 0);\n  const targetWidth = Math.round(Number(targetFrame?.width) || 0);\n  const targetHeight = Math.round(Number(targetFrame?.height) || 0);\n  if (sourceWidth === targetWidth && sourceHeight === targetHeight) return next;\n  return { ...next, zoom: 1, offsetX: 0, offsetY: 0 };\n}\n\nfunction formatNumberDraft(value, fallback = 0) {`,
  'frame photo transfer helpers',
);

app = replaceOnce(
  app,
  `function CollageFrame({ frame, photoIdentity, selected, locked, borderWidth, borderColor, printMode, canvas, pageOffsetX, moveFrameWithPhoto, snapFrames = [], smartSnap = true, collagePreviewOnly = false, onSelect, onPhotoMove, onFrameChange, onFrameDragFinish, onSnapGuidesChange = () => {} }) {`,
  `function CollageFrame({ frame, photoIdentity, selected, locked, borderWidth, borderColor, printMode, canvas, pageOffsetX, moveFrameWithPhoto, snapFrames = [], smartSnap = true, collagePreviewOnly = false, onSelect, onPhotoMove, onFrameChange, onFrameDragFinish, onContextMenu, onSnapGuidesChange = () => {} }) {`,
  'frame context callback prop',
);

app = replaceOnce(
  app,
  `  const canDragFrame = !collagePreviewOnly && !printMode && !locked;`,
  `  const canDragFrame = !collagePreviewOnly && !printMode && !locked && (!frame.photo || moveFrameWithPhoto);`,
  'frame drag mode gating',
);

app = replaceOnce(
  app,
  `  function commitFrameDrag(event) {\n    if (collagePreviewOnly || printMode || locked) return;`,
  `  function commitFrameDrag(event) {\n    if (!canDragFrame) return;`,
  'frame drag finish gating',
);

app = replaceOnce(
  app,
  `        onMouseDown={onSelect}\n        onTap={onSelect}\n        onDragStart={(event) => {`,
  `        onMouseDown={onSelect}\n        onTap={onSelect}\n        onContextMenu={(event) => {\n          event.evt?.preventDefault?.();\n          event.cancelBubble = true;\n          onContextMenu?.({\n            x: Number(event.evt?.clientX) || 0,\n            y: Number(event.evt?.clientY) || 0,\n          });\n        }}\n        onDragStart={(event) => {`,
  'frame right click handler',
);

app = replaceOnce(
  app,
  `function PageLayer({ page, pageIndex, x, y = 0, canvas, settings, activePageId, selectedFrameId, moveFrameWithPhotoId, snapGuides = null, smartSnap = true, printMode = false, collagePreviewOnly = false, hideGuidePageLabel = false, onFrameSelect, onPhotoMove, onFrameChange, onFrameDragFinish, onSnapGuidesChange, onColumnResize, onRowResize, onActivatePage }) {`,
  `function PageLayer({ page, pageIndex, x, y = 0, canvas, settings, activePageId, selectedFrameId, moveFrameWithPhotoId, snapGuides = null, smartSnap = true, printMode = false, collagePreviewOnly = false, hideGuidePageLabel = false, onFrameSelect, onPhotoMove, onFrameChange, onFrameDragFinish, onFrameContextMenu, onSnapGuidesChange, onColumnResize, onRowResize, onActivatePage }) {`,
  'page frame context callback prop',
);

app = replaceOnce(
  app,
  `          onSelect={() => !collagePreviewOnly && !printMode && onFrameSelect(page.id, frame.id)}\n          onPhotoMove={(frameId, patch) => !collagePreviewOnly && !printMode && onPhotoMove(page.id, frameId, patch)}`,
  `          onSelect={() => !collagePreviewOnly && !printMode && onFrameSelect(page.id, frame.id)}\n          onContextMenu={(position) => !collagePreviewOnly && !printMode && onFrameContextMenu?.(page.id, frame.id, position)}\n          onPhotoMove={(frameId, patch) => !collagePreviewOnly && !printMode && onPhotoMove(page.id, frameId, patch)}`,
  'page frame context callback wiring',
);

app = replaceOnce(
  app,
  `  const [moveFrameWithPhotoId, setMoveFrameWithPhotoId] = useState(null);\n  const [frameSnapGuides, setFrameSnapGuides] = useState(null);`,
  `  const [moveFrameWithPhotoId, setMoveFrameWithPhotoId] = useState(null);\n  const [frameClipboard, setFrameClipboard] = useState(null);\n  const [frameSwapSource, setFrameSwapSource] = useState(null);\n  const [frameContextMenu, setFrameContextMenu] = useState(null);\n  const [frameSnapGuides, setFrameSnapGuides] = useState(null);`,
  'frame clipboard state',
);

app = replaceOnce(
  app,
  `  useEffect(() => {\n    try { localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(templateRecords)); } catch { /* ignore localStorage errors */ }\n  }, [templateRecords]);\n\n  useEffect(() => {\n    const node = canvasAreaRef.current;`,
  `  useEffect(() => {\n    try { localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(templateRecords)); } catch { /* ignore localStorage errors */ }\n  }, [templateRecords]);\n\n  useEffect(() => {\n    if (!frameContextMenu) return undefined;\n    const closeMenu = (event) => {\n      if (event.target?.closest?.('[data-frame-context-menu="true"]')) return;\n      setFrameContextMenu(null);\n    };\n    const closeOnEscape = (event) => {\n      if (event.key === 'Escape') setFrameContextMenu(null);\n    };\n    window.addEventListener('pointerdown', closeMenu);\n    window.addEventListener('keydown', closeOnEscape);\n    return () => {\n      window.removeEventListener('pointerdown', closeMenu);\n      window.removeEventListener('keydown', closeOnEscape);\n    };\n  }, [frameContextMenu]);\n\n  useEffect(() => {\n    const node = canvasAreaRef.current;`,
  'context menu close behavior',
);

app = replaceOnce(
  app,
  `  const selectedFrame = useMemo(() => currentPage?.frames.find((frame) => frame.id === selectedFrameId) ?? null, [currentPage, selectedFrameId]);\n\n  useEffect(() => {`,
  `  const selectedFrame = useMemo(() => currentPage?.frames.find((frame) => frame.id === selectedFrameId) ?? null, [currentPage, selectedFrameId]);\n  const contextFrame = frameContextMenu\n    ? frameAtLocation(pages, frameContextMenu.pageId, frameContextMenu.frameId)\n    : null;\n\n  useEffect(() => {`,
  'context frame lookup',
);

app = replaceOnce(
  app,
  `  function updatePageFrames(pageId, updater) {\n    setAlbum((current) => ({\n      ...current,\n      pages: current.pages.map((page) => (page.id === pageId ? { ...page, frames: typeof updater === 'function' ? updater(page.frames) : updater } : page)),\n    }));\n  }`,
  `  function updatePageFrames(pageId, updater) {\n    setAlbum((current) => ({\n      ...current,\n      pages: current.pages.map((page) => (page.id === pageId ? { ...page, frames: typeof updater === 'function' ? updater(page.frames) : updater } : page)),\n    }));\n  }\n\n  function openFrameContextMenu(pageId, frameId, position) {\n    if (locked || collagePreviewOnly) return;\n    setSelectedPhotoId(null);\n    setAlbum((current) => ({ ...current, currentPageId: pageId }));\n    setSelectedFrameId(frameId);\n    setInspectorTab('object');\n    setMoveFrameWithPhotoId(null);\n    setFrameContextMenu({\n      pageId,\n      frameId,\n      x: Math.max(8, Number(position?.x) || 0),\n      y: Math.max(8, Number(position?.y) || 0),\n    });\n  }\n\n  function copyFramePhoto(mode = 'copy') {\n    if (!frameContextMenu) return;\n    const frame = frameAtLocation(album.pages, frameContextMenu.pageId, frameContextMenu.frameId);\n    if (!frame?.photo) {\n      setFrameContextMenu(null);\n      show('В этом окне нет фото');\n      return;\n    }\n    const nextMode = mode === 'cut' ? 'cut' : 'copy';\n    setFrameClipboard({\n      mode: nextMode,\n      pageId: frameContextMenu.pageId,\n      frameId: frameContextMenu.frameId,\n      photo: cloneDeep(frame.photo),\n      sourceFrame: { width: frame.width, height: frame.height },\n    });\n    setFrameContextMenu(null);\n    show(nextMode === 'cut'\n      ? 'Фото готово к переносу. Правой кнопкой по другому окну → «Вставить фото»'\n      : 'Фото скопировано. Правой кнопкой по окну → «Вставить фото»');\n  }\n\n  function pasteFramePhoto() {\n    if (!frameClipboard || !frameContextMenu) return;\n    const clipboard = frameClipboard;\n    const destination = frameContextMenu;\n    const sameFrame = clipboard.pageId === destination.pageId && clipboard.frameId === destination.frameId;\n    if (clipboard.mode === 'cut' && sameFrame) {\n      setFrameContextMenu(null);\n      show('Это то же самое окно');\n      return;\n    }\n\n    setAlbum((current) => {\n      const targetFrame = frameAtLocation(current.pages, destination.pageId, destination.frameId);\n      if (!targetFrame) return current;\n      const transferredPhoto = photoForFrameTransfer(clipboard.photo, clipboard.sourceFrame, targetFrame);\n      const nextPages = current.pages.map((page) => ({\n        ...page,\n        frames: (page.frames || []).map((frame) => {\n          const isTarget = page.id === destination.pageId && frame.id === destination.frameId;\n          const isCutSource = clipboard.mode === 'cut' && page.id === clipboard.pageId && frame.id === clipboard.frameId;\n          if (isTarget) return { ...frame, photo: transferredPhoto };\n          if (isCutSource) return { ...frame, photo: null };\n          return frame;\n        }),\n      }));\n      return { ...current, pages: nextPages, currentPageId: destination.pageId };\n    });\n\n    setSelectedFrameId(destination.frameId);\n    setMoveFrameWithPhotoId(null);\n    setFrameContextMenu(null);\n    if (clipboard.mode === 'cut') setFrameClipboard(null);\n    show(clipboard.mode === 'cut' ? 'Фото перенесено' : 'Фото вставлено');\n  }\n\n  function chooseFrameForSwap() {\n    if (!frameContextMenu) return;\n    setFrameSwapSource({ pageId: frameContextMenu.pageId, frameId: frameContextMenu.frameId });\n    setFrameContextMenu(null);\n    show('Первое окно выбрано. Правой кнопкой по второму → «Поменять местами»');\n  }\n\n  function swapFramePhotosFromMenu() {\n    if (!frameSwapSource || !frameContextMenu) return;\n    const sourceLocation = frameSwapSource;\n    const targetLocation = frameContextMenu;\n    const sameFrame = sourceLocation.pageId === targetLocation.pageId && sourceLocation.frameId === targetLocation.frameId;\n    if (sameFrame) {\n      setFrameSwapSource(null);\n      setFrameContextMenu(null);\n      show('Обмен отменён');\n      return;\n    }\n\n    const sourcePreview = frameAtLocation(album.pages, sourceLocation.pageId, sourceLocation.frameId);\n    const targetPreview = frameAtLocation(album.pages, targetLocation.pageId, targetLocation.frameId);\n    if (!sourcePreview || !targetPreview) {\n      setFrameSwapSource(null);\n      setFrameContextMenu(null);\n      show('Одно из окон уже не существует');\n      return;\n    }\n\n    setAlbum((current) => {\n      const sourceFrame = frameAtLocation(current.pages, sourceLocation.pageId, sourceLocation.frameId);\n      const targetFrame = frameAtLocation(current.pages, targetLocation.pageId, targetLocation.frameId);\n      if (!sourceFrame || !targetFrame) return current;\n      const photoForSource = photoForFrameTransfer(targetFrame.photo, targetFrame, sourceFrame);\n      const photoForTarget = photoForFrameTransfer(sourceFrame.photo, sourceFrame, targetFrame);\n      const nextPages = current.pages.map((page) => ({\n        ...page,\n        frames: (page.frames || []).map((frame) => {\n          if (page.id === sourceLocation.pageId && frame.id === sourceLocation.frameId) return { ...frame, photo: photoForSource };\n          if (page.id === targetLocation.pageId && frame.id === targetLocation.frameId) return { ...frame, photo: photoForTarget };\n          return frame;\n        }),\n      }));\n      return { ...current, pages: nextPages, currentPageId: targetLocation.pageId };\n    });\n\n    setSelectedFrameId(targetLocation.frameId);\n    setMoveFrameWithPhotoId(null);\n    setFrameSwapSource(null);\n    setFrameContextMenu(null);\n    show('Фото поменялись местами');\n  }`,
  'frame clipboard and swap actions',
);

app = replaceOnce(
  app,
  `    setMoveFrameWithPhotoId(null);\n    setFrameSnapGuides(null);`,
  `    setMoveFrameWithPhotoId(null);\n    setFrameClipboard(null);\n    setFrameSwapSource(null);\n    setFrameContextMenu(null);\n    setFrameSnapGuides(null);`,
  'history restore clipboard reset',
);

app = replaceOnce(
  app,
  `        onFrameChange={changeFrame}\n        onFrameDragFinish={() => setMoveFrameWithPhotoId(null)}\n        onSnapGuidesChange={updateFrameSnapGuides}`,
  `        onFrameChange={changeFrame}\n        onFrameDragFinish={() => setMoveFrameWithPhotoId(null)}\n        onFrameContextMenu={openFrameContextMenu}\n        onSnapGuidesChange={updateFrameSnapGuides}`,
  'interactive page context menu wiring',
);

app = replaceOnce(
  app,
  `      {notice && <div className="notice">{notice}</div>}\n\n\n      <section className="workspace editor-workspace-v2">`,
  `      {notice && <div className="notice">{notice}</div>}\n\n      {frameContextMenu && contextFrame && (\n        <div\n          data-frame-context-menu="true"\n          role="menu"\n          aria-label="Действия с фото в окне"\n          onContextMenu={(event) => event.preventDefault()}\n          style={{\n            position: 'fixed',\n            left: Math.max(12, Math.min(frameContextMenu.x, window.innerWidth - 252)),\n            top: Math.max(12, Math.min(frameContextMenu.y, window.innerHeight - 300)),\n            zIndex: 10000,\n            width: 240,\n            padding: 8,\n            display: 'grid',\n            gap: 4,\n            border: '1px solid #d8c7b9',\n            borderRadius: 12,\n            background: '#fffdf9',\n            boxShadow: '0 16px 42px rgba(44, 35, 30, 0.22)',\n          }}\n        >\n          <div style={{ padding: '7px 10px 5px', fontSize: 12, fontWeight: 700, color: '#75675d', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>\n            {contextFrame.photo?.name || 'Пустое фото-окно'}\n          </div>\n          {contextFrame.photo && (\n            <>\n              <button type="button" role="menuitem" onClick={() => copyFramePhoto('copy')} style={{ border: 0, borderRadius: 8, background: 'transparent', padding: '10px 12px', textAlign: 'left', font: 'inherit', cursor: 'pointer' }}>Копировать фото</button>\n              <button type="button" role="menuitem" onClick={() => copyFramePhoto('cut')} style={{ border: 0, borderRadius: 8, background: 'transparent', padding: '10px 12px', textAlign: 'left', font: 'inherit', cursor: 'pointer' }}>Вырезать фото</button>\n            </>\n          )}\n          {frameClipboard && (\n            <button type="button" role="menuitem" onClick={pasteFramePhoto} style={{ border: 0, borderRadius: 8, background: '#f2e8df', padding: '10px 12px', textAlign: 'left', font: 'inherit', fontWeight: 700, cursor: 'pointer' }}>Вставить фото</button>\n          )}\n          <div style={{ height: 1, margin: '4px 6px', background: '#eadfd6' }} />\n          {!frameSwapSource && (\n            <button type="button" role="menuitem" onClick={chooseFrameForSwap} style={{ border: 0, borderRadius: 8, background: 'transparent', padding: '10px 12px', textAlign: 'left', font: 'inherit', cursor: 'pointer' }}>Поменять местами…</button>\n          )}\n          {frameSwapSource && frameSwapSource.pageId === frameContextMenu.pageId && frameSwapSource.frameId === frameContextMenu.frameId && (\n            <button type="button" role="menuitem" onClick={() => { setFrameSwapSource(null); setFrameContextMenu(null); show('Обмен отменён'); }} style={{ border: 0, borderRadius: 8, background: 'transparent', padding: '10px 12px', textAlign: 'left', font: 'inherit', cursor: 'pointer' }}>Отменить обмен</button>\n          )}\n          {frameSwapSource && (frameSwapSource.pageId !== frameContextMenu.pageId || frameSwapSource.frameId !== frameContextMenu.frameId) && (\n            <button type="button" role="menuitem" onClick={swapFramePhotosFromMenu} style={{ border: 0, borderRadius: 8, background: '#e6f1eb', padding: '10px 12px', textAlign: 'left', font: 'inherit', fontWeight: 700, cursor: 'pointer' }}>Поменять местами</button>\n          )}\n        </div>\n      )}\n\n\n      <section className="workspace editor-workspace-v2">`,
  'frame context menu ui',
);

writeFileSync(appPath, app);
console.log('Frame photo clipboard patch applied');
