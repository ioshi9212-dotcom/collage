from pathlib import Path
p=Path('src/AppLive.jsx')
s=p.read_text()
a="""function normalizeBookletPrintSettings(value = {}) {
  const showCropMarks = Boolean(value.showCropMarks);
  const requestedMargin = Number(value.margin ?? DEFAULT_BOOKLET_PRINT_SETTINGS.margin) || 0;
  const minimumMargin = showCropMarks ? CROP_MARK_OFFSET + CROP_MARK_LENGTH : 0;
  return {
    showFoldLine: Boolean(value.showFoldLine),
    showCropMarks,
    gap: Math.round(clamp(value.gap ?? DEFAULT_BOOKLET_PRINT_SETTINGS.gap, 0, MAX_BOOKLET_PRINT_GAP)),
    margin: Math.round(clamp(Math.max(requestedMargin, minimumMargin), 0, MAX_BOOKLET_PRINT_MARGIN)),
  };
}
"""
b="""function normalizeBookletPrintSettings(value = {}) {
  const showCropMarks = Boolean(value.showCropMarks);
  const requestedMargin = Number(value.margin ?? DEFAULT_BOOKLET_PRINT_SETTINGS.margin) || 0;
  const minimumMargin = showCropMarks ? CROP_MARK_OFFSET + CROP_MARK_LENGTH : 0;
  return {
    ...normalizeHomeBookletPrintSettings(value),
    showFoldLine: Boolean(value.showFoldLine),
    showCropMarks,
    gap: Math.round(clamp(value.gap ?? DEFAULT_BOOKLET_PRINT_SETTINGS.gap, 0, MAX_BOOKLET_PRINT_GAP)),
    margin: Math.round(clamp(Math.max(requestedMargin, minimumMargin), 0, MAX_BOOKLET_PRINT_MARGIN)),
  };
}
"""
if s.count(a)!=1: raise SystemExit('normalize anchor mismatch')
p.write_text(s.replace(a,b,1))
