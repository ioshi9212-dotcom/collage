# Templates

This folder stores built-in collage templates for the editor.

## Structure

```text
public/templates/index.json
public/templates/<template-id>.json
public/template-assets/backgrounds/
public/template-assets/decor/
```

## Template manifest

`index.json` will be used by the editor to show template categories and available templates.

Example future entry:

```json
{
  "id": "wedding-soft-01",
  "title": "Нежный свадебный 01",
  "category": "wedding",
  "preview": "/template-assets/previews/wedding-soft-01.png",
  "src": "/templates/wedding-soft-01.json",
  "photoSlots": 4,
  "format": "a5-portrait"
}
```

## Template JSON idea

A template should store layout and design, but not user photos:

```json
{
  "version": 1,
  "id": "wedding-soft-01",
  "title": "Нежный свадебный 01",
  "page": {
    "presetId": "a5-portrait",
    "width": 1480,
    "height": 2100
  },
  "background": {
    "type": "color",
    "color": "#f5e6da",
    "image": null
  },
  "photoSlots": [],
  "texts": [],
  "decorations": []
}
```
