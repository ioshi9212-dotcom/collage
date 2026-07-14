from pathlib import Path

path = Path('src/AppLive.jsx')
text = path.read_text(encoding='utf-8')

old_class = '<div className="app-header-actions-v2">'
new_class = '<div className="app-header-actions-v2 file-actions">'
if text.count(old_class) != 1:
    raise SystemExit(f'header actions match count: {text.count(old_class)}')
text = text.replace(old_class, new_class, 1)

old_account = '''          <button className="button" type="button" onClick={() => document.querySelector('.cloud-auth-toggle')?.click()}>Аккаунт</button>
        </div>'''
new_account = '''          <button className="button" type="button" onClick={() => document.querySelector('.cloud-auth-toggle')?.click()}>Аккаунт</button>
          <input className="hidden-input project-storage-json-input" type="file" accept="application/json" onChange={importJson} />
        </div>'''
if text.count(old_account) != 1:
    raise SystemExit(f'account bridge match count: {text.count(old_account)}')
text = text.replace(old_account, new_account, 1)

path.write_text(text, encoding='utf-8')
print('editor shell storage compatibility applied')
