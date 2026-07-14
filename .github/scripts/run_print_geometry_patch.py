from pathlib import Path

PATCHER = Path('.github/scripts/apply_print_geometry.py')
source = PATCHER.read_text(encoding='utf-8')

start_marker = 'page_guide_old = "<PageVisualGuides'
end_marker = 'app = app.replace(page_guide_old, page_guide_new)\n'

start = source.find(start_marker)
if start < 0:
    raise SystemExit('page guide patch block start not found')
end = source.find(end_marker, start)
if end < 0:
    raise SystemExit('page guide patch block end not found')
end += len(end_marker)

replacement = '''app = replace_once(
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
'''

patched_source = source[:start] + replacement + source[end:]
exec(compile(patched_source, str(PATCHER), 'exec'), {'__name__': '__main__'})
