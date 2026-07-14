from pathlib import Path
p=Path('src/AppLive.jsx')
s=p.read_text()
a="""function normalizeBookletPrintSettings(value = {}) {\n  const showCropMarks = Boolean(value.showCropMarks);\n  const requestedMargin = Number(value.margin ?? DEFAULT_BOOKLET_PRINT_SETTINGS.margin) || 0;\n  const minimumMargin = showCropMarks ? CROP_MARK_OFFSET + CROP_MARK_LENGTH : 0;\n  return {\n    showFoldLine: Boolean(value.showFoldLine),\n    showCropMarks,\n    gap: Math.round(clamp(value.gap ?? DEFAULT_BOOKLET_PRINT_SETTINGS.gap, 0, MAX_BOOKLET_PRINT_GAP)),\n    margin: Math.round(clamp(Math.max(requestedMargin, minimumMargin), 0, MAX_BOOKLET_PRINT_MARGIN)),\n  };\n}\n"""
b="""function normalizeBookletPrintSettings(value = {}) {\n  const showCropMarks = Boolean(value.showCropMarks);\n  const requestedMargin = Number(value.margin ?? DEFAULT_BOOKLET_PRINT_SETTINGS.margin) || 0;\n  const minimumMargin = showCropMarks ? CROP_MARK_OFFSET + CROP_MARK_LENGTH : 0;\n  return {\n    ...normalizeHomeBookletPrintSettings(value),\n    showCropMarks,\n    gap: Math.round(clamp(value.gap ?? DEFAULT_BOOKLET_PRINT_SETTINGS.gap, 0, MAX_BOOKLET_PRINT_GAP)),\n    margin: Math.round(clamp(Math.max(requestedMargin, minimumMargin), 0, MAX_BOOKLET_PRINT_MARGIN)),\n  };\n}\n"""
if s.count(a)!=1: raise SystemExit('normalize anchor mismatch')
p.write_text(s.replace(a,b,1))
