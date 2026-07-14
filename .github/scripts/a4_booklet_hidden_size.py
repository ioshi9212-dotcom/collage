from pathlib import Path
p=Path('src/AppLive.jsx')
s=p.read_text()
a='<Stage ref={printBookletRef} width={bookletSheetSize.width} height={bookletSheetSize.height}>'
b='<Stage ref={printBookletRef} width={bookletExportSheetSize.width} height={bookletExportSheetSize.height}>'
if s.count(a)!=1: raise SystemExit('stage size mismatch')
s=s.replace(a,b,1)
a='<BookletSheetBackground canvas={canvas} printSettings={normalizedBookletPrintSettings} />'
b='<BookletSheetBackground canvas={canvas} printSettings={bookletExportPrintSettings} />'
if s.count(a)!=1: raise SystemExit('stage background mismatch')
p.write_text(s.replace(a,b,1))
