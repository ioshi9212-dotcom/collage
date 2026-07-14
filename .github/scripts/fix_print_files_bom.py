from pathlib import Path

path = Path('src/editor/printFiles.js')
text = path.read_text(encoding='utf-8')
literal = 'begin="\ufeff"'
escaped = 'begin="\\uFEFF"'
count = text.count(literal)
if count != 1:
    raise SystemExit(f'expected one literal XMP BOM, got {count}')
path.write_text(text.replace(literal, escaped, 1), encoding='utf-8')
print('replaced literal XMP BOM with an explicit Unicode escape')
