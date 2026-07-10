# Templates

Здесь лежат готовые шаблоны редактора.

## Как добавить новый шаблон

1. В редакторе открой режим `Шаблоны`.
2. Создай ручной шаблон: фон, фото-окна, рамки, текст.
3. Нажми `Скачать JSON шаблона`.
4. Положи JSON в эту папку, например:

```text
public/templates/my-template.json
```

5. Добавь запись в `public/templates/index.json`:

```json
{
  "id": "my-template",
  "title": "Мой шаблон",
  "category": "custom",
  "src": "/templates/my-template.json",
  "photoSlots": 4,
  "format": "a5-portrait"
}
```

Фотографии пользователя в шаблон не сохраняются. Шаблон хранит дизайн: фон, окна, рамки, текст и декор.
