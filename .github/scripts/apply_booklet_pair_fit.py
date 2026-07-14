from pathlib import Path

APP = Path('src/AppLive.jsx')
CSS = Path('src/styles.css')

app = APP.read_text(encoding='utf-8')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label} mismatch: expected 1, got {count}')
    return text.replace(old, new, 1)

app = replace_once(
    app,
    "} from './editor/bookletPrint';\n\nconst STORAGE_KEY",
    "} from './editor/bookletPrint';\nimport {\n  getBookletVisiblePageNumbers,\n  getPreviewScale,\n} from './editor/previewFit';\n\nconst STORAGE_KEY",
    'preview import',
)

app = replace_once(
    app,
    "function scaleForPreview(width, height, isSpread) {\n  const maxWidth = isSpread ? 1220 : 880;\n  const maxHeight = 720;\n  return Math.min(1, maxWidth / width, maxHeight / height);\n}\n\n",
    "",
    'legacy preview scale helper',
)

app = replace_once(
    app,
    "  const noticeTimerRef = useRef(null);\n  const photoUploadInFlightRef = useRef(false);",
    "  const noticeTimerRef = useRef(null);\n  const canvasAreaRef = useRef(null);\n  const photoUploadInFlightRef = useRef(false);",
    'canvas ref',
)

app = replace_once(
    app,
    "  const [dragPageIndex, setDragPageIndex] = useState(null);\n  const [dragOverPageIndex, setDragOverPageIndex] = useState(null);",
    "  const [dragPageIndex, setDragPageIndex] = useState(null);\n  const [dragOverPageIndex, setDragOverPageIndex] = useState(null);\n  const [previewViewport, setPreviewViewport] = useState({ width: 1220, height: 720 });",
    'preview viewport state',
)

app = replace_once(
    app,
    "  useEffect(() => {\n    try { localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(templateRecords)); } catch { /* ignore localStorage errors */ }\n  }, [templateRecords]);\n\n  const collagePreviewOnly",
    "  useEffect(() => {\n    try { localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(templateRecords)); } catch { /* ignore localStorage errors */ }\n  }, [templateRecords]);\n\n  useEffect(() => {\n    const node = canvasAreaRef.current;\n    if (!node) return undefined;\n\n    let animationFrame = 0;\n    const measure = () => {\n      window.cancelAnimationFrame(animationFrame);\n      animationFrame = window.requestAnimationFrame(() => {\n        const rect = node.getBoundingClientRect();\n        const styles = window.getComputedStyle(node);\n        const horizontalPadding = (Number.parseFloat(styles.paddingLeft) || 0) + (Number.parseFloat(styles.paddingRight) || 0);\n        const verticalPadding = (Number.parseFloat(styles.paddingTop) || 0) + (Number.parseFloat(styles.paddingBottom) || 0);\n        const toolbarHeight = node.querySelector('.canvas-toolbar')?.getBoundingClientRect().height || 0;\n        const width = Math.max(260, Math.min(1220, rect.width - horizontalPadding - 24));\n        const height = Math.max(260, Math.min(720, window.innerHeight - Math.max(0, rect.top) - toolbarHeight - verticalPadding - 36));\n        setPreviewViewport((current) => (\n          Math.abs(current.width - width) < 1 && Math.abs(current.height - height) < 1\n            ? current\n            : { width, height }\n        ));\n      });\n    };\n\n    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;\n    observer?.observe(node);\n    window.addEventListener('resize', measure);\n    measure();\n\n    return () => {\n      observer?.disconnect();\n      window.removeEventListener('resize', measure);\n      window.cancelAnimationFrame(animationFrame);\n    };\n  }, [viewMode, bookletSideId, canvas.width, canvas.height]);\n\n  const collagePreviewOnly",
    'responsive viewport effect',
)

app = replace_once(
    app,
    "  const visibleBookletPageNumbers = useMemo(() => {\n    if (!currentBookletSide) return new Set();\n    return new Set(currentBookletSide.slots.filter((slot) => !slot.isBlank && slot.pageNumber).map((slot) => slot.pageNumber));\n  }, [currentBookletSide]);",
    "  const visibleBookletPageNumbers = useMemo(\n    () => getBookletVisiblePageNumbers(currentBookletSide),\n    [currentBookletSide],\n  );",
    'booklet visible pages',
)

app = replace_once(
    app,
    "  const previewScale = scaleForPreview(stageRealWidth, stageRealHeight, isSpread || isBooklet);",
    "  const previewScale = getPreviewScale({\n    stageWidth: stageRealWidth,\n    stageHeight: stageRealHeight,\n    viewportWidth: previewViewport.width,\n    viewportHeight: previewViewport.height,\n  });",
    'responsive preview scale',
)

app = replace_once(
    app,
    "        activePageId={album.currentPageId}",
    "        activePageId={isBooklet ? entry.page?.id ?? null : album.currentPageId}",
    'both booklet pages active on canvas',
)

app = replace_once(
    app,
    "          const isVisibleInBooklet = isBooklet && visibleBookletPageNumbers.has(pageNumber);\n          return (\n            <button key={page.id} type=\"button\" className={`page-chip ${page.id === album.currentPageId ? 'active-page-chip' : ''} ${isVisibleInBooklet ? 'booklet-visible-page' : ''}`}",
    "          const isVisibleInBooklet = isBooklet && visibleBookletPageNumbers.has(pageNumber);\n          const isActivePage = isBooklet ? isVisibleInBooklet : page.id === album.currentPageId;\n          return (\n            <button key={page.id} type=\"button\" className={`page-chip ${isActivePage ? 'active-page-chip' : ''} ${isVisibleInBooklet ? 'booklet-visible-page' : ''}`}",
    'page strip pair active',
)

app = replace_once(
    app,
    "              const isCurrent = page.id === album.currentPageId;\n              const isSpreadPage",
    "              const isVisibleInBooklet = isBooklet && visibleBookletPageNumbers.has(pageNumber);\n              const isCurrent = isBooklet ? isVisibleInBooklet : page.id === album.currentPageId;\n              const isSpreadPage",
    'rail pair current',
)

app = replace_once(
    app,
    "              const isVisibleInBooklet = isBooklet && visibleBookletPageNumbers.has(pageNumber);\n              const isOnStage = isBooklet ? isVisibleInBooklet : isSpread ? isSpreadPage : isCurrent;",
    "              const isOnStage = isBooklet ? isVisibleInBooklet : isSpread ? isSpreadPage : isCurrent;",
    'remove duplicate rail visible declaration',
)

app = replace_once(
    app,
    "        <section className={`canvas-area ${isSpread || isBooklet ? 'album-mode' : ''} ${isBooklet ? 'booklet-canvas-area' : ''}`} style={{ '--stage-display-width': `${stageDisplayWidth}px` }}>",
    "        <section ref={canvasAreaRef} className={`canvas-area ${isSpread || isBooklet ? 'album-mode' : ''} ${isBooklet ? 'booklet-canvas-area' : ''}`} style={{ '--stage-display-width': `${stageDisplayWidth}px`, '--stage-display-height': `${stageDisplayHeight}px` }}>",
    'canvas fit ref and variables',
)

app = replace_once(
    app,
    "          <div className={`stage-frame ${isSpread || isBooklet ? 'album-preview' : ''} ${isBooklet ? 'booklet-stage' : ''}`} style={{ width: stageDisplayWidth, height: stageDisplayHeight }} onDragOver=",
    "          <div className={`stage-frame ${isSpread || isBooklet ? 'album-preview' : ''} ${isBooklet ? 'booklet-stage' : ''}`} onDragOver=",
    'remove fixed stage dimensions',
)

APP.write_text(app, encoding='utf-8')

css = CSS.read_text(encoding='utf-8')
marker = '/* Responsive booklet pair preview: keep both pages active and fit the canvas without internal scrollbars. */'
if marker in css:
    raise SystemExit('responsive preview CSS already present')

css += f"""

{marker}
.workspace.three-columns,
.three-columns {{
  grid-template-columns: 220px minmax(320px, 1fr) 250px !important;
  width: 100%;
  justify-content: stretch;
}}

.canvas-area {{
  width: 100%;
  justify-self: stretch;
}}

.stage-frame {{
  width: min(100%, calc(var(--stage-display-width) + 24px));
  height: calc(var(--stage-display-height) + 24px);
  max-height: none;
  overflow: hidden; /* fitted preview: no internal scrollbars */
}}

.stage-scale-shell {{
  overflow: hidden;
}}

.page-rail-card.booklet-visible-rail-card,
.page-rail-card.current-page-rail-card.booklet-visible-rail-card {{
  border-color: var(--ui-green-dark);
  background: var(--ui-green-soft);
  box-shadow: inset 0 0 0 2px rgba(47, 125, 82, 0.26), 0 5px 14px rgba(47, 125, 82, 0.1);
}}

@media (max-width: 1180px) {{
  .workspace.three-columns,
  .three-columns {{
    grid-template-columns: 210px minmax(0, 1fr) !important;
  }}
}}
"""

CSS.write_text(css, encoding='utf-8')
