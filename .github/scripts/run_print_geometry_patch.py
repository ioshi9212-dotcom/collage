from pathlib import Path

PATCHER = Path('.github/scripts/apply_print_geometry.py')
source = PATCHER.read_text(encoding='utf-8')


def replace_source_block(text: str, start_marker: str, end_marker: str, replacement: str, label: str) -> str:
    start = text.find(start_marker)
    if start < 0:
        raise SystemExit(f'{label} start not found')
    end = text.find(end_marker, start)
    if end < 0:
        raise SystemExit(f'{label} end not found')
    end += len(end_marker)
    return text[:start] + replacement + text[end:]


source = replace_source_block(
    source,
    'page_guide_old = "<PageVisualGuides',
    'app = app.replace(page_guide_old, page_guide_new)\n',
    '''app = replace_once(
    app,
    "<PageVisualGuides canvas={canvas} safe={safe} locked={locked} pageIndex={pageIndex} active={page?.id === activePageId} />",
    "<PageVisualGuides canvas={canvas} layoutInset={layoutInset} printGuide={printGuide} locked={locked} pageIndex={pageIndex} active={page?.id === activePageId} />",
    'blank page print guide',
)
app = replace_once(
    app,
    "<PageVisualGuides canvas={canvas} safe={safe} locked={locked} pageIndex={pageIndex} active={page.id === activePageId} />",
    "<PageVisualGuides canvas={canvas} layoutInset={layoutInset} printGuide={printGuide} locked={locked} pageIndex={pageIndex} active={page.id === activePageId} />",
    'page print guide',
)
''',
    'page guide patch block',
)

source = replace_source_block(
    source,
    "if 'EXPORT_RATIO' not in app:\n",
    "    raise SystemExit('booklet export ratios: leftover EXPORT_RATIO')\n",
    r'''app = replace_once(
    app,
    "function buildBookletManifestJson({ plan, canvas, sheetsPerBlock, printSettings, imageEntries }) {",
    "function buildBookletManifestJson({ plan, canvas, sheetsPerBlock, printSettings, exportRatio, imageEntries }) {",
    'booklet manifest ratio input',
)
app = replace_once(
    app,
    "    exportRatio: EXPORT_RATIO,",
    "    exportRatio,",
    'booklet manifest ratio value',
)
app = app.replace('pixelRatio: EXPORT_RATIO', 'pixelRatio: bookletPixelRatio')
app = replace_once(
    app,
    "      printSettings: normalizedBookletPrintSettings,\n      imageEntries,",
    "      printSettings: normalizedBookletPrintSettings,\n      exportRatio: bookletPixelRatio,\n      imageEntries,",
    'booklet package ratio',
)
if 'EXPORT_RATIO' in app:
    raise SystemExit('booklet export ratios: leftover EXPORT_RATIO')
''',
    'booklet ratio patch block',
)

if source.count('new_export = """') != 1:
    raise SystemExit('print export template marker not found exactly once')
source = source.replace('new_export = """', 'new_export = r"""', 1)

exec(compile(source, str(PATCHER), 'exec'), {'__name__': '__main__'})
