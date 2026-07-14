from pathlib import Path
p=Path('src/AppLive.jsx')
s=p.read_text()
a="""function downloadText(filename, text) {\n  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));\n  downloadDataUrl(filename, url);\n  setTimeout(() => URL.revokeObjectURL(url), 1000);\n}\n"""
b=a+"""\nfunction downloadPlainText(filename, text) {\n  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));\n  downloadDataUrl(filename, url);\n  setTimeout(() => URL.revokeObjectURL(url), 1000);\n}\n"""
if s.count(a)!=1: raise SystemExit('download anchor mismatch')
p.write_text(s.replace(a,b,1))
