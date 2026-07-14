# Cold editor shell v1

## Status

This document defines the approved direction for a behavior-neutral editor shell redesign. The branch must stay separate from `main` until visual review and explicit approval.

## Design direction

Use the latest approved concept as the layout reference, but do not copy generated colors or invented features.

### Layout

- Compact top application bar.
- Slim second tool row.
- Narrow vertical tool rail on the far left.
- Docked context panel next to the tool rail.
- Large central canvas on a cool-gray workspace.
- Docked object/page inspector on the right.
- Compact horizontal page/spread strip at the bottom.

### Real tools only

Left rail:

- Фото
- Страницы
- Коллаж
- Текст
- Рисунки
- Шаблоны

Do not add generated features such as backgrounds, elements, or history until they exist in the product.

## Visual system

The interface must be cold, neutral, graphic and precise. It must not use a green or beige wash.

### Color tokens

- Application background: `#ECEEEF`
- Workspace background: `#DDE1E3`
- Panels: `#F8F9F9`
- Inputs and paper: `#FFFFFF`
- Primary text: `#272B2E`
- Secondary text: `#70767A`
- Border: `#D2D6D8`
- Strong border: `#ADB4B8`
- Main graphite: `#3E484D`
- Main graphite hover: `#30393E`
- Soft active state: `#E3E7E9`
- Selected page state: `#CBD3D7`
- Danger: `#B65050`
- Danger background: `#FFF5F5`

### Shape and depth

- Main panels: 4–6 px radius.
- Controls: 3–5 px radius.
- Avoid pill buttons except true status chips.
- Use thin dividers instead of nesting every section inside a card.
- Shadows are reserved mainly for the paper/canvas and temporary menus.
- The canvas must be the strongest visual object.

## Button hierarchy

### Primary

Only the global `Сохранить` action receives a solid graphite fill.

### Modes

`Страница / Разворот / Брошюра` and `Коллаж / Текст / Рисунки / Шаблоны` use a soft active background or underline, not the primary-button treatment.

### Secondary actions

Open, duplicate, rebuild, clear, add page and similar actions use white/transparent backgrounds with thin borders.

### Tool toggles

Guides, grid, undo, redo and zoom controls are compact. Their border appears mainly on hover; enabled state uses a soft neutral fill.

### Export

The top bar contains one `Экспорт` menu. Existing PNG, PDF, album, brochure and JSON actions remain available inside it.

### Danger

Delete actions use muted red text and border; avoid solid red fills.

## Panel responsibilities

### Left dock

The active tool determines the content panel. Photo library remains docked and keeps upload, used-state badges, drag/drop and selection.

### Collage panel

Contains frame count, gap, layout padding, grid/free mode, rebuild frames and clear photos. These controls should no longer be scattered across the top bar and canvas.

### Right inspector

Tabs or contextual sections for `Объект` and `Страница`. When no object is selected, useful page properties replace the current empty instruction-only state.

`Размер и печать` stays collapsed by default and is not a permanent top block.

### Booklet mode

Booklet controls live in the right inspector or a dedicated contextual panel. The central canvas continues showing the real printed page pair.

### Bottom page strip

- Compact thumbnails.
- Current page/spread selection.
- Booklet paired-page selection.
- Drag reorder remains supported.
- Add-page action is integrated into the strip.

## Behavior that must not change

- Project schema.
- Frame coordinates.
- Photo storage and IndexedDB.
- Save/open behavior.
- Cloud/account behavior.
- PNG/PDF export.
- Physical print geometry.
- Booklet imposition and manual duplex settings.
- Existing project compatibility.

## Implementation order

1. Color tokens and button hierarchy.
2. Compact top application bar and export menu.
3. Left tool rail and docked context panel.
4. Bottom page strip.
5. Right inspector restructuring.
6. Booklet panel adaptation.
7. Responsive behavior.
8. Full lint, tests, production build and Chromium coverage.
9. Visual review before any merge.
