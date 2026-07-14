from pathlib import Path
p=Path('src/AppLive.jsx')
s=p.read_text()
a='const position = getBookletPagePosition(index, canvas, normalizedBookletPrintSettings);'
b='const position = getBookletPagePosition(index, canvas, bookletExportPrintSettings);'
if s.count(a)!=1: raise SystemExit('hidden position mismatch')
s=s.replace(a,b,1)
a='<BookletPrintGuides canvas={canvas} printSettings={normalizedBookletPrintSettings} />'
b='<BookletPrintGuides canvas={canvas} printSettings={bookletExportPrintSettings} />'
if s.count(a)!=1: raise SystemExit('hidden guides mismatch')
p.write_text(s.replace(a,b,1))
