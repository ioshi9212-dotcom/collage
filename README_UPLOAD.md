# Collage template mode v1

Это ZIP для точечной замены/добавления файлов в проект.

## Заменить файлы

```text
index.html
public/album-layers.js
public/album-layers.css
```

## Добавить файлы

```text
public/local-font-aliases.css
public/template-mode.js
public/template-mode.css
public/templates/index.json
public/templates/a5-soft-wedding-4.json
public/templates/a5-clean-family-3.json
public/templates/README.md
public/template-assets/README.md
```

## Что добавлено

- Режим `Шаблоны` теперь читает `public/templates/index.json`.
- В шаблонах есть JSON-структура: фон, фото-окна, рамки, тексты.
- Можно применить готовый шаблон к текущей странице.
- Можно создать ручной шаблон.
- Можно выбрать цвет фона через палитру и HEX.
- Можно загрузить картинку фоном для шаблона.
- Можно добавить фото-окна, двигать их на холсте и менять рамку.
- Можно скачать JSON созданного шаблона.
- Добавлена кнопка `PNG вида + шаблон`.

## Важно

Файлы шрифтов в ZIP не включены. Они уже должны лежать в проекте:

```text
public/fonts/*.ttf
```

Шрифты подключаются из этой папки через `@font-face`.

## Проверка

После замены/добавления файлов:

```bash
npm install
npm run build
```
