from pathlib import Path
p=Path('src/AppLive.jsx')
s=p.read_text()
a="""const DEFAULT_BOOKLET_PRINT_SETTINGS = {\n  showFoldLine: false,\n  showCropMarks: false,\n  gap: 0,\n  margin: 0,\n};\n"""
b="""const DEFAULT_BOOKLET_PRINT_SETTINGS = {\n  showFoldLine: false,\n  showCropMarks: false,\n  gap: 0,\n  margin: 0,\n  backOrder: BOOKLET_BACK_ORDER_REVERSE,\n  rotateBack180: false,\n  paperThicknessMm: 0.12,\n};\n"""
if s.count(a)!=1: raise SystemExit('defaults anchor mismatch')
p.write_text(s.replace(a,b,1))
