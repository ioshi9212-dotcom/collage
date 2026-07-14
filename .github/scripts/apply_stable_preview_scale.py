from pathlib import Path

APP = Path('src/AppLive.jsx')
app = APP.read_text(encoding='utf-8')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label} mismatch: expected 1, got {count}')
    return text.replace(old, new, 1)


app = replace_once(
    app,
    "import {\n  getBookletVisiblePageNumbers,\n  getPreviewScale,\n} from './editor/previewFit';",
    "import {\n  getBookletVisiblePageNumbers,\n  getPreviewScale,\n  getStablePreviewViewport,\n} from './editor/previewFit';",
    'stable viewport import',
)

old_effect = """  useEffect(() => {
    const node = canvasAreaRef.current;
    if (!node) return undefined;

    let animationFrame = 0;
    const measure = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const rect = node.getBoundingClientRect();
        const styles = window.getComputedStyle(node);
        const horizontalPadding = (Number.parseFloat(styles.paddingLeft) || 0) + (Number.parseFloat(styles.paddingRight) || 0);
        const verticalPadding = (Number.parseFloat(styles.paddingTop) || 0) + (Number.parseFloat(styles.paddingBottom) || 0);
        const toolbarHeight = node.querySelector('.canvas-toolbar')?.getBoundingClientRect().height || 0;
        const width = Math.max(260, Math.min(1220, rect.width - horizontalPadding - 24));
        const height = Math.max(260, Math.min(720, window.innerHeight - Math.max(0, rect.top) - toolbarHeight - verticalPadding - 36));
        setPreviewViewport((current) => (
          Math.abs(current.width - width) < 1 && Math.abs(current.height - height) < 1
            ? current
            : { width, height }
        ));
      });
    };

    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(node);
    window.addEventListener('resize', measure);
    measure();

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      window.cancelAnimationFrame(animationFrame);
    };
  }, [viewMode, bookletSideId, canvas.width, canvas.height]);"""

new_effect = """  useEffect(() => {
    const node = canvasAreaRef.current;
    if (!node) return undefined;

    let animationFrame = 0;
    let settleTimer = 0;
    let observedWidth = 0;

    const measure = () => {
      const rect = node.getBoundingClientRect();
      const styles = window.getComputedStyle(node);
      const horizontalPadding = (Number.parseFloat(styles.paddingLeft) || 0) + (Number.parseFloat(styles.paddingRight) || 0);
      const nextViewport = getStablePreviewViewport({
        containerWidth: rect.width,
        viewportHeight: window.innerHeight,
        horizontalPadding,
      });
      setPreviewViewport((current) => (
        Math.abs(current.width - nextViewport.width) < 1 && Math.abs(current.height - nextViewport.height) < 1
          ? current
          : nextViewport
      ));
    };

    const scheduleMeasure = (delay = 0) => {
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = window.requestAnimationFrame(measure);
      }, delay);
    };

    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect?.width ?? node.getBoundingClientRect().width;
      if (Math.abs(nextWidth - observedWidth) < 1) return;
      observedWidth = nextWidth;
      scheduleMeasure(60);
    }) : null;
    observer?.observe(node);

    const onWindowResize = () => scheduleMeasure(60);
    window.addEventListener('resize', onWindowResize);
    scheduleMeasure();

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', onWindowResize);
      window.clearTimeout(settleTimer);
      window.cancelAnimationFrame(animationFrame);
    };
  }, []);"""

app = replace_once(app, old_effect, new_effect, 'stable preview effect')
APP.write_text(app, encoding='utf-8')
