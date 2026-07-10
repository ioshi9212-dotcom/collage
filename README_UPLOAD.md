# Collage templates patch v3 — no template flicker

Заменить файлы по тем же путям:

- `src/AppLive.jsx`
- `public/album-layers.js`
- `public/album-layers.css`
- `public/template-mode.js`
- `public/template-mode.css`
- `public/local-font-aliases.css`
- `index.html`

Также добавить/оставить папки:

- `public/templates/`
- `public/template-assets/`

## Что исправлено в v3

1. Убран конфликт владельцев режима `Шаблоны`.
   - `album-layers.js` больше не перерисовывает заглушку `скоро будет` в режиме шаблонов.
   - `template-mode.js` остаётся единственным владельцем панелей шаблонов.

2. Исправлено мигание между заглушкой и реальным редактором шаблонов.

3. Сохранены фиксы v2:
   - текст попадает в PNG страницы и разворота;
   - пустые фото-окна без фото не печатаются в PNG;
   - остаётся только фон страницы.

## Проверка

```bash
npm install
npm run build
```
