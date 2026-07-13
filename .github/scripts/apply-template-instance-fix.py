from pathlib import Path

path = Path('src/AppLive.jsx')
text = path.read_text(encoding='utf-8')

old_runtime = """  function runtimePageFromTemplate(page, index) {
    const next = cloneDeep(page);
    return {
      ...next,
      id: makeId(),
      title: `Страница ${index + 1}`,
      frames: Array.isArray(next?.frames) ? next.frames.map((frame) => ({ ...frame, photo: null })) : [],
    };
  }
"""
new_runtime = """  function runtimePageFromTemplate(page, index) {
    const next = clonePageForDuplicate(page, index + 1);
    return {
      ...next,
      title: `Страница ${index + 1}`,
      frames: Array.isArray(next?.frames) ? next.frames.map((frame) => ({ ...frame, photo: null })) : [],
    };
  }
"""

old_layers = """      const cleaned = {
        texts: Array.isArray(sourcePage?.texts) ? cloneDeep(sourcePage.texts) : [],
        drawings: Array.isArray(sourcePage?.drawings) ? cloneDeep(sourcePage.drawings) : [],
        templates: [],
      };
"""
new_layers = """      const cleaned = cloneLayerPage({
        texts: Array.isArray(sourcePage?.texts) ? sourcePage.texts : [],
        drawings: Array.isArray(sourcePage?.drawings) ? sourcePage.drawings : [],
        templates: [],
      });
"""

assert text.count(old_runtime) == 1, f'runtime block count: {text.count(old_runtime)}'
assert text.count(old_layers) == 1, f'layer block count: {text.count(old_layers)}'
text = text.replace(old_runtime, new_runtime, 1).replace(old_layers, new_layers, 1)
path.write_text(text, encoding='utf-8')
