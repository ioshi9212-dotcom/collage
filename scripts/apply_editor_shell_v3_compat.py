from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


app_path = Path('src/AppLive.jsx')
app = app_path.read_text(encoding='utf-8')

for panel, icon, label in [
    ('photos', '▧', 'Фото'),
    ('pages', '▤', 'Страницы'),
    ('collage', '▦', 'Коллаж'),
    ('text', 'T', 'Текст'),
    ('drawings', '╱', 'Рисунки'),
    ('templates', '◇', 'Шаблоны'),
]:
    old = f'''          <button type="button" className={{`editor-tool-button-v2 ${{leftPanel === '{panel}' ? 'active' : ''}}`}} onClick='''
    new = f'''          <button type="button" aria-label="{label}" className={{`editor-tool-button-v2 ${{leftPanel === '{panel}' ? 'active' : ''}}`}} onClick='''
    app = replace_once(app, old, new, f'{label} aria label')

app = replace_once(
    app,
    '''            <span>{pages.length}</span>
            {!isBooklet && (''',
    '''            <span>{pages.length}</span>
            <button type="button" className="button page-rail-add-v3" onClick={addPage}>+ Страница</button>
            {!isBooklet && (''',
    'persistent add page button',
)

app_path.write_text(app, encoding='utf-8')

css_path = Path('src/editor-shell-v2.css')
css = css_path.read_text(encoding='utf-8')
css += '''

/* shell v3 compatibility polish */
.cloud-auth-panel.collapsed {
  display: none !important;
}

.page-rail-add-v3 {
  flex: 0 0 auto;
  min-height: 30px;
  padding-inline: 12px;
  white-space: nowrap;
}
'''
css_path.write_text(css, encoding='utf-8')

for filename in ['e2e/booklet-print.spec.js', 'e2e/editor-shell-v3.spec.js']:
    path = Path(filename)
    text = path.read_text(encoding='utf-8')
    old = "page.getByText('Настройки брошюры', { exact: true })"
    new = "page.getByRole('heading', { name: 'Настройки брошюры', exact: true })"
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{filename}: expected one booklet heading locator, found {count}')
    path.write_text(text.replace(old, new, 1), encoding='utf-8')

print('shell v3 compatibility patch applied')
