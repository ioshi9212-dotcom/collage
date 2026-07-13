from pathlib import Path

replacements = {
    'public/cloud-auth.test.mjs': [
        (r"/async function saveAsNew\(\) \{([\s\S]*?)\n  \}/", r"/async function saveAsNew\(\) \{([\s\S]*?)\n {2}\}/"),
    ],
    'src/editor/project-storage.test.mjs': [
        (r"/if \(label === 'Сохранить'\) \{([\s\S]*?)\n      \}/", r"/if \(label === 'Сохранить'\) \{([\s\S]*?)\n {6}\}/"),
    ],
    'src/editor/projectLoad.test.mjs': [
        (r"/function applyProjectData\(data, message\) \{([\s\S]*?)\n  \}/", r"/function applyProjectData\(data, message\) \{([\s\S]*?)\n {2}\}/"),
    ],
    'server.js': [
        ("import { createReadStream, existsSync, statSync } from 'node:fs';", "import { createReadStream, existsSync } from 'node:fs';"),
        ("import { basename, extname, join, resolve } from 'node:path';", "import { basename, extname, resolve } from 'node:path';"),
    ],
}

for filename, pairs in replacements.items():
    path = Path(filename)
    text = path.read_text()
    for old, new in pairs:
        if old not in text:
            raise SystemExit(f'Expected text not found in {filename}: {old}')
        text = text.replace(old, new, 1)
    path.write_text(text)

path = Path('public/project-storage.js')
text = path.read_text()
old = """  async function saveFullProjectSnapshot() {
    try {
      const result = await persistCurrentEditorProject({ source: 'manual-save' });
      const { pageCount, photoCount: photos, decorCount: decor } = result.stats;
      const detail = photos > 0
        ? `страниц: ${pageCount}, фото: ${photos}, оформление: ${decor}`
        : `страниц: ${pageCount}, без фото, оформление: ${decor}`;
      showToast(`Проект сохранён полностью — ${detail}`);
    } catch (error) {
      console.error(error);
      showToast(error.message || 'Не удалось сохранить проект полностью', true);
    }
  }

"""
if old not in text:
    raise SystemExit('Expected unused saveFullProjectSnapshot function was not found')
path.write_text(text.replace(old, '', 1))
