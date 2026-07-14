from pathlib import Path


def replace_once(text, old, new, label):
    if old in text:
        return text.replace(old, new, 1)
    if new in text:
        return text
    raise SystemExit(f'Expected source block not found: {label}')


path = Path('src/AppLive.jsx')
app = path.read_text(encoding='utf-8')
app = replace_once(app,
"""  function project() {
    return createLocalPhotoProject({
      canvas,
      settings,
      library,
      pages,
      currentPageId: album.currentPageId,
      viewMode,
      bookletSheetsPerBlock,
      bookletPrintSettings: normalizedBookletPrintSettings,
      extraLayers: sanitizeExtraLayers(extraLayers),
      albumEditorMode: albumMode,
      savedAt: new Date().toISOString(),
    });
  }

  async function portableProject() {
    return createPortablePhotoProject(project());
  }
""",
"""  function liveProject() {
    return {
      canvas,
      settings,
      library,
      pages,
      currentPageId: album.currentPageId,
      viewMode,
      bookletSheetsPerBlock,
      bookletPrintSettings: normalizedBookletPrintSettings,
      extraLayers: sanitizeExtraLayers(extraLayers),
      albumEditorMode: albumMode,
      savedAt: new Date().toISOString(),
    };
  }

  function project() {
    return createLocalPhotoProject(liveProject());
  }

  async function portableProject() {
    return createPortablePhotoProject(liveProject());
  }
""",
'live local and portable photo projects')
path.write_text(app, encoding='utf-8')
