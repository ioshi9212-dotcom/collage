# Collage templates patch v2 + PNG export fix

Заменить файлы в проекте по тем же путям:

- `src/AppLive.jsx`
- `index.html`
- `public/album-layers.js`
- `public/album-layers.css`
- `public/template-mode.js`
- `public/template-mode.css`
- `public/local-font-aliases.css`
- `public/templates/index.json`
- `public/templates/a5-soft-wedding-4.json`
- `public/templates/a5-clean-family-3.json`
- `public/templates/README.md`
- `public/template-assets/README.md`

Что исправлено в v2:

1. PNG страницы и PNG разворота теперь берут текстовые слои `ExtraPageLayers`.
2. Пустые фото-окна без фото не попадают в PNG — остаётся только фон страницы.
3. Сборка проверена командой `npm run build`.

Важно: файлы шрифтов `.ttf` в ZIP не вложены. Они должны лежать в репозитории в `public/fonts/`.
