from pathlib import Path
p=Path('src/AppLive.jsx')
s=p.read_text()
a="""import {\n  addPngDensityMetadata,\n  buildRasterPrintPdf,\n  pngDataUrlToJpegPage,\n} from './editor/printFiles';\n"""
b=a+"""import {\n  BOOKLET_BACK_ORDER_REVERSE,\n  BOOKLET_BACK_ORDER_SAME,\n  buildBookletPrintInstructions,\n  buildManualDuplexBookletOrder,\n  estimateFoldedBlockThicknessMm,\n  getA4BookletPrintGeometry,\n  normalizeHomeBookletPrintSettings,\n  rotateRasterDataUrl180,\n  shouldRotateBookletSide,\n} from './editor/bookletPrint';\n"""
if s.count(a)!=1: raise SystemExit('import anchor mismatch')
p.write_text(s.replace(a,b,1))
