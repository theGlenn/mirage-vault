# Mirage Vault — Design System

Source of truth for UI design tokens, components, and visual guidelines.

---

## Colors

### Dark Theme

| Token             | Value              | Usage                          |
|-------------------|--------------------|--------------------------------|
| `--bg-primary`    | `rgb(24, 24, 27)`  | Page/app background            |
| `--bg-secondary`  | `rgb(28, 28, 31)`  | Sidebar backgrounds            |
| `--bg-surface`    | `rgb(34, 34, 37)`  | Cards, text fields, inputs     |
| `--bg-elevated`   | `rgb(42, 42, 46)`  | Hover states, elevated panels  |
| `--text-primary`  | `#F6F6F6`          | Primary text                   |
| `--text-secondary`| `#999999`          | Labels, captions               |
| `--text-muted`    | `#666666`          | Hints, disabled                |
| `--border`        | `#333336`          | Default borders                |
| `--border-accent` | `#E8751A`          | Active/accent borders          |

### Accent Colors

| Token            | Value     | Usage                  |
|------------------|-----------|------------------------|
| `--accent-yellow`| `#F5C542` | Highlights, badges     |
| `--accent-orange`| `#E8751A` | Primary actions        |
| `--accent-red`   | `#D94E1F` | Danger, delete actions |
| `--accent-deep`  | `#C0392B` | Pressed/deep accents   |

### Entity Type Colors

| Entity   | Color     | Token               |
|----------|-----------|----------------------|
| Email    | `#3b82f6` | `--entity-email`     |
| Person   | `#22c55e` | `--entity-person`    |
| Org      | `#f97316` | `--entity-org`       |
| Amount   | `#ef4444` | `--entity-amt`       |
| Phone    | `#a855f7` | `--entity-phone`     |
| API Key  | `#6b7280` | `--entity-api-key`   |

### File Type Icon Colors

| File Type | Color     | Usage                        |
|-----------|-----------|------------------------------|
| `.txt`    | `#999999` | Default secondary text color |
| `.pdf`    | `#ef4444` | Red — PDF documents          |
| `.csv`    | `#22c55e` | Green — spreadsheet/tabular  |
| `.json`   | `#f5c542` | Yellow — structured data     |
| `.md`     | `#3b82f6` | Blue — markdown documents    |

---

## Typography

### Font Families

| Font          | Usage                                              | Package             |
|---------------|----------------------------------------------------|--------------------|
| **Geist**     | Body text, content, monospace fallback              | `geist` (npm)      |
| **Geist Mono**| Code blocks, entity tokens, file viewer content     | `geist` (npm)      |
| **Geist Pixel** (Square variant) | Buttons, section headers, nav labels, brand text, file type badges | `geist` (npm) |

### Font Sizing

| Element                | Font      | Size   | Weight   |
|------------------------|-----------|--------|----------|
| Brand text ("VAULT")   | Geist Pixel | 8px   | 400      |
| Nav labels             | Geist Pixel | 6px   | 400      |
| Section headings       | Geist Pixel | 10-14px | 400    |
| Summary labels         | Geist Pixel | 8px   | 400      |
| Toolbar buttons        | Geist     | 12px   | 500      |
| Body text              | Geist     | 14px   | 400      |
| File card name         | Geist     | 13px   | 500      |
| File viewer content    | Geist Mono | 13px  | 400      |
| Entity tokens          | Geist Mono | 11px  | 400      |
| Page markers           | Geist Pixel | 8px  | 400      |

---

## Border Radius

| Element                     | Radius |
|-----------------------------|--------|
| Buttons (action, toolbar)   | 8px    |
| Cards (file cards)          | 8px    |
| Dialogs / popups            | 12px   |
| Input fields, textareas     | 6px    |
| Badges, tags                | 4px    |
| Toast notifications         | 8px    |
| View toggles (container)    | 8px    |
| Toggle buttons (inner)      | 6px    |
| Entity swatches             | 2px    |
| Search bar                  | 0px    |

---

## Icons

- **Source**: [Pixelarticons](https://github.com/halfmage/pixelarticons) (24x24 pixel grid)
- **Rendering**: `shape-rendering: crispEdges` for pixel-perfect appearance
- **Default color**: Inherits from `currentColor`
- **File type icons** use distinct colors (see File Type Icon Colors above)

### Icon Inventory

| Name            | Usage                     |
|-----------------|---------------------------|
| `folder`        | Browse nav item           |
| `file`          | .txt files                |
| `file-alt`      | .pdf files                |
| `table`         | .csv files                |
| `code`          | .json files               |
| `article`       | .md files                 |
| `search`        | Search bar                |
| `close`         | Close buttons             |
| `settings`      | Settings nav item         |
| `download`      | Export / download          |
| `clipboard`     | Paste text                |
| `trash`         | Delete                    |
| `upload`        | File upload / drop zone   |
| `sun`           | Light theme               |
| `moon`          | Dark theme                |
| `alert`         | Warnings                  |
| `chevron-down`  | Expandable sections       |
| `chevron-right` | Expandable sections       |

---

## Layout

### App Shell

```
┌─────────────────────────────────────────┐
│  Sidebar (64px)  │  Content (flex:1)  │  Entity Panel (240px)  │
│  Fixed left      │  Scroll internal   │  Fixed right            │
└─────────────────────────────────────────┘
```

- App shell: `height: 100vh; overflow: hidden` — the app frame itself never scrolls
- Content area: Internal scroll only within `.file-browser` and `.viewer-content`
- Sidebars: Fixed width, no horizontal scroll

### File Grid

- Layout: `display: grid`
- Columns: `repeat(auto-fill, minmax(220px, 1fr))`
- Gap: `16px`
- Padding: `20px`
- Cards: `min-height: 0` — prevent grid item overflow

### Scrolling Rules

1. The `html` and `body` elements have `overflow: hidden` — no page-level scroll
2. `.file-browser` scrolls its content via `overflow-y: auto`
3. `.viewer-content` scrolls its content via `overflow: auto`
4. `.sidebar-content` scrolls its content via `overflow-y: auto`
5. `.settings-screen` scrolls via `overflow-y: auto`

---

## Text Alignment

- **Pasted text items**: `text-align: start` (left-aligned)
- **File names in cards**: Left-aligned with text overflow ellipsis
- **Entity panel values**: Left-aligned with `word-break: break-all`
- **Drop zone content**: Center-aligned
- **Toolbar**: Flex between left/right groups

---

## Component Patterns

### Buttons

- **Primary (action)**: Accent orange background, white text, 8px radius
- **Secondary**: Border only, surface background, 8px radius
- **Toolbar**: Border, surface background, icon + text, 8px radius
- **Icon-only**: No background, no border, inherits color

### Cards

- Background: `--bg-surface`
- Border: `2px solid var(--border)`
- Radius: `8px`
- Hover: Background shifts to `--bg-elevated`, left border accents
- Grid items reserve 4px left border space to prevent layout shift on hover

### Dialogs / Popups

- Background: `--bg-surface`
- Border: `2px solid var(--border)`
- Radius: `12px`
- Overlay: `rgba(0, 0, 0, 0.5)` backdrop

### Toast

- Fixed bottom-center
- Background: `--bg-elevated`
- Border: `2px solid var(--border-accent)`
- Radius: `8px`

---

## Transitions

- Background/color changes: `0.15s ease`
- Border color changes: `0.15s ease`
- No motion-heavy animations (respects `prefers-reduced-motion`)

---

## Theme Support

- **Modes**: Dark, Light, System
- **Storage**: `localStorage` key `aether-theme`
- **Mechanism**: `data-theme` attribute on `<html>`
- **Default**: System (follows OS preference)
