# PRD: Vault App Pixel Art Redesign (Iteration 1)

## Introduction

Overhaul the Aether Vault desktop app's visual identity and interaction patterns. The current three-panel layout (left sidebar, center content, right sidebar) is preserved structurally, but each panel gets a new role and the entire UI adopts a pixel art aesthetic inspired by Mistral's design language: dark backgrounds, warm yellow/orange/red gradients, pixel art icons from [pixelarticons](https://pixelarticons.com/), and a retro-modern feel. The center area introduces a file browser grid as the default view, with an overlay popup for file viewing that stays constrained within the center panel. A full dark/light theme system is included.

## Goals

- Establish a distinctive pixel art visual identity for Aether Vault, heavily inspired by Mistral's design language
- Restructure the left sidebar as a navigation menu (Browse / Settings sections)
- Transform the center area into a file browser grid with an overlay search bar and a constrained file viewer popup
- Make the right panel context-dependent (entity details when viewing a file, theme toggle when in settings)
- Implement a dark/light theme system with a warm yellow/orange color palette
- Integrate pixelarticons (SVG inline, free set) for all UI icons
- Maintain all existing functionality (drag-drop, paste, file ingestion, export, delete)

## User Stories

### US-001: Left sidebar navigation menu
**Description:** As a user, I want a navigation menu on the left with "Browse" and "Settings" sections so I can switch between the file browser and settings.

**Acceptance Criteria:**
- [ ] Left sidebar displays two navigation items: "Browse" (pixel folder icon) and "Settings" (pixel gear/cog icon)
- [ ] "Browse" is selected by default and shows the file browser grid in the center
- [ ] Clicking "Settings" shows the settings screen in the center
- [ ] Active nav item is visually highlighted with the warm accent color (orange/yellow)
- [ ] Navigation icons use pixelarticons SVGs inlined in the component
- [ ] Sidebar has a compact width (~56-72px) with icon + label layout, or icon-only with tooltip
- [ ] App logo/branding area at the top of the sidebar (pixel art Aether Shroud identity)
- [ ] Typecheck passes
- [ ] Verify in browser using `pnpm tauri dev`

### US-002: Center area file browser grid (default view)
**Description:** As a user, I want to see all my vault files displayed as a grid of cards in the center area so I can quickly browse and find files.

**Acceptance Criteria:**
- [ ] Center area shows a grid of file cards when "Browse" is selected and no file overlay is open
- [ ] Each card shows: pixel file-type icon, file name (truncated if long), entity count badge, file type badge, and creation date
- [ ] Cards use the warm color palette (orange/yellow tints for backgrounds, borders inspired by Mistral's model cards)
- [ ] Empty state shows a pixel art drop zone with drag-drop support and "Select Files" button
- [ ] Paste text area remains accessible (below the grid or as a separate action)
- [ ] Grid is responsive to the center area width
- [ ] Typecheck passes
- [ ] Verify in browser using `pnpm tauri dev`

### US-003: Overlay search bar at the bottom of center area
**Description:** As a user, I want a search bar floating at the bottom of the center area so I can quickly filter files by name or content.

**Acceptance Criteria:**
- [ ] A search input is rendered as a floating bar at the bottom of the center area, overlaying the file grid
- [ ] Search filters the file grid in real-time as the user types
- [ ] Search matches against file name (always) and file content (masked content to avoid showing raw PII)
- [ ] When search has a value, only matching files are shown in the grid
- [ ] Search bar has a pixel art search icon (pixelarticons) and clear button
- [ ] Search bar is semi-transparent with a blur/frosted effect consistent with the pixel art theme
- [ ] Typecheck passes
- [ ] Verify in browser using `pnpm tauri dev`

### US-004: File viewer overlay popup (constrained to center area)
**Description:** As a user, I want clicking a file card to open a viewer overlay that is constrained to the center area so I can view file contents without leaving the file browser context.

**Acceptance Criteria:**
- [ ] Clicking a file card opens an overlay popup inside the center area only (the overlay does NOT cover the left or right panels)
- [ ] Overlay has a semi-transparent backdrop constrained to the center panel
- [ ] Overlay popup contains: file name header, masked/original toggle, content viewer, copy/export toolbar
- [ ] Popup has a close "x" button (pixelarticons close icon) in the top-right corner
- [ ] Clicking the backdrop (anywhere in the center area outside the popup) dismisses the popup
- [ ] Pressing Escape dismisses the popup
- [ ] When overlay is open, the right panel shows entity details for the selected file
- [ ] Warning banner for PDFs with extraction issues is shown inside the popup
- [ ] Typecheck passes
- [ ] Verify in browser using `pnpm tauri dev`

### US-005: Right panel — context-dependent content
**Description:** As a user, I want the right panel to show relevant information depending on what I'm doing, so I always have useful context.

**Acceptance Criteria:**
- [ ] When "Browse" is active and a file overlay is open: right panel shows entity details for the selected file (grouped by type, same data as current implementation)
- [ ] When "Browse" is active and no file is selected: right panel shows a summary (total files, total entities, file type breakdown) or an empty state
- [ ] When "Settings" is active: right panel is empty or hidden
- [ ] Transition between contexts is smooth (no jarring layout shifts)
- [ ] Typecheck passes
- [ ] Verify in browser using `pnpm tauri dev`

### US-006: Settings screen — theme toggle
**Description:** As a user, I want a settings screen with a dark/light theme toggle so I can switch the app's appearance.

**Acceptance Criteria:**
- [ ] Settings screen is rendered in the center area when "Settings" is selected in the left nav
- [ ] Contains a "Theme" section with a toggle or segmented control: Dark / Light / System
- [ ] Selecting Dark forces dark mode, Light forces light mode, System follows OS preference
- [ ] Theme preference is persisted in localStorage
- [ ] On app load, the persisted theme preference is applied before first paint (no flash)
- [ ] Settings screen uses pixel art styling consistent with the rest of the app
- [ ] Typecheck passes
- [ ] Verify in browser using `pnpm tauri dev`

### US-007: Pixel art design system — colors, typography, and theme tokens
**Description:** As a developer, I need a set of CSS custom properties (design tokens) for the pixel art theme so all components share a consistent visual language.

**Acceptance Criteria:**
- [ ] CSS custom properties defined on `:root` and `[data-theme="dark"]` / `[data-theme="light"]` selectors
- [ ] Color palette includes: background tones (dark grays for dark mode, warm off-whites for light mode), accent warm colors (yellow `#F5A623` to orange `#E8751A` to deep red `#C0392B`), text colors, border colors, surface/card colors
- [ ] Typography uses a pixel-friendly font stack: a monospace or pixel font for headings/labels, system font for body text. Consider `"Press Start 2P"` or similar for headings, monospace for code
- [ ] All existing entity type colors are preserved (email=blue, person=green, org=orange, amt=red, phone=purple, api_key=gray)
- [ ] Border radius is set to 0 or very small (2px max) to maintain pixel art sharpness — no rounded corners
- [ ] Buttons and interactive elements have a stepped/pixel border style
- [ ] Typecheck passes

### US-008: Integrate pixelarticons SVGs
**Description:** As a developer, I need pixel art icons integrated as inline SVGs so the UI has a consistent retro icon set.

**Acceptance Criteria:**
- [ ] Icons needed: folder, file, search, close/x, settings/gear, download/export, copy, trash/delete, chevron, warning, drag-drop/upload, sun (light mode), moon (dark mode)
- [ ] Each icon is an inline SVG component or a Svelte component wrapping the SVG
- [ ] Icons from the free pixelarticons set are used where available
- [ ] Icons respect the current theme colors (use `currentColor`)
- [ ] Icons render crisp at 24x24 on the pixel grid (no anti-aliasing blur via `shape-rendering: crispEdges` or `image-rendering: pixelated`)
- [ ] Typecheck passes

### US-009: File actions — delete with confirmation
**Description:** As a user, I want to delete files from the vault with a confirmation dialog that matches the pixel art style.

**Acceptance Criteria:**
- [ ] Each file card in the grid has a delete button (trash icon, visible on hover)
- [ ] Clicking delete opens a pixel-art-styled confirmation dialog
- [ ] Confirmation dialog uses the warm accent colors and pixel borders
- [ ] Dialog is constrained to the center area (same pattern as file viewer overlay)
- [ ] Cancel and Delete buttons are clearly differentiated
- [ ] Typecheck passes
- [ ] Verify in browser using `pnpm tauri dev`

### US-010: Drag-drop and paste ingestion in new layout
**Description:** As a user, I want drag-drop and paste-to-redact functionality to work seamlessly in the new file browser layout.

**Acceptance Criteria:**
- [ ] Drag-drop files onto the center area triggers ingestion (same as current behavior)
- [ ] Drag-over state shows a pixel art visual indicator (e.g., pulsing border with accent color)
- [ ] "Select Files" button available in the empty state and as an action button in the toolbar or nav
- [ ] Paste text functionality is accessible (either as a button that opens an input area, or as a permanent section below the grid)
- [ ] Processing spinner uses a pixel art style animation
- [ ] Typecheck passes
- [ ] Verify in browser using `pnpm tauri dev`

## Functional Requirements

- FR-1: The left sidebar must contain exactly two navigation items: "Browse" and "Settings"
- FR-2: The center area must default to a file browser grid showing all ingested files as cards
- FR-3: A floating search bar at the bottom of the center area must filter files by name and content in real-time
- FR-4: Clicking a file card must open an overlay popup constrained entirely within the center area boundaries
- FR-5: The file viewer overlay must support masked/original toggle, copy, export, and close actions
- FR-6: Clicking outside the popup (but within the center area) or pressing Escape must dismiss the popup
- FR-7: The right panel must show entity details when a file is selected, a vault summary when browsing with no selection, and nothing/empty when in settings
- FR-8: The settings screen must include a dark/light/system theme toggle with localStorage persistence
- FR-9: All icons must be pixelarticons SVGs rendered inline with `currentColor` and crisp rendering
- FR-10: CSS custom properties must define the full color palette, supporting both dark and light themes
- FR-11: The app must continue to support drag-drop file ingestion, file picker dialog, and paste-to-redact
- FR-12: Delete confirmation must use an overlay dialog constrained to the center area
- FR-13: The pixel art aesthetic must use sharp corners (0-2px border radius), warm accent colors (yellow/orange/red), and dark backgrounds in dark mode
- FR-14: Export All functionality must remain accessible (moved to toolbar or file browser header)
- FR-15: Toast notifications must remain functional with pixel art styling

## Non-Goals

- No changes to the Tauri/Rust backend or database schema
- No changes to detection/masking logic
- No new file format support
- No settings beyond theme toggle in this iteration
- No animations beyond hover states and simple transitions (no complex pixel art sprite animations)
- No custom pixel art font creation — use existing Google Fonts pixel fonts
- No mobile/responsive layouts (this is a desktop Tauri app with a fixed window)
- No redesign of the Chrome extension
- No modification to existing Tauri commands or IPC interface

## Design Considerations

### Visual References
- **Primary inspiration:** Mistral AI platform design (see `design/inspo/` screenshots)
  - Dark background (`~#1a1a1a` to `#2a2a2a`)
  - Pixel art icons for navigation and file types (retro computer, folder icons)
  - Warm color gradient: Yellow (`#F5C542`) → Orange (`#E8751A`) → Red-Orange (`#D94E1F`) → Deep Red (`#C0392B`)
  - Cards with colored backgrounds and pixel art illustrations
  - Uppercase labels with wide letter-spacing
  - Thin orange/gold border lines as section separators

### Color Palette (Dark Theme)
| Token | Value | Usage |
|-------|-------|-------|
| `--bg-primary` | `#1a1a1a` | App background |
| `--bg-secondary` | `#222222` | Sidebar, panels |
| `--bg-surface` | `#2a2a2a` | Cards, inputs |
| `--bg-elevated` | `#333333` | Hover states, popups |
| `--accent-yellow` | `#F5C542` | Primary accent, selected states |
| `--accent-orange` | `#E8751A` | Buttons, active elements |
| `--accent-red` | `#D94E1F` | Destructive actions, warnings |
| `--accent-deep` | `#C0392B` | Borders, emphasis |
| `--text-primary` | `#F6F6F6` | Body text |
| `--text-secondary` | `#999999` | Labels, meta |
| `--text-muted` | `#666666` | Disabled, hints |
| `--border` | `#333333` | Default borders |
| `--border-accent` | `#E8751A` | Accent borders, separators |

### Color Palette (Light Theme)
| Token | Value | Usage |
|-------|-------|-------|
| `--bg-primary` | `#FAF7F2` | App background (warm off-white) |
| `--bg-secondary` | `#F0EDE6` | Sidebar, panels |
| `--bg-surface` | `#FFFFFF` | Cards, inputs |
| `--bg-elevated` | `#F5F2ED` | Hover states |
| `--accent-yellow` | `#D4952A` | Primary accent (darker for contrast) |
| `--accent-orange` | `#C5611A` | Buttons, active elements |
| `--accent-red` | `#B8431A` | Destructive actions |
| `--accent-deep` | `#A22E1F` | Borders, emphasis |
| `--text-primary` | `#1A1A1A` | Body text |
| `--text-secondary` | `#666666` | Labels, meta |
| `--text-muted` | `#999999` | Disabled, hints |
| `--border` | `#E0DDD6` | Default borders |
| `--border-accent` | `#C5611A` | Accent borders |

### Typography
- **Headings / Labels:** `"Press Start 2P"` (Google Fonts) at small sizes (10-12px) for pixel art feel, or fallback to system monospace
- **Body / Content:** `"JetBrains Mono", "SF Mono", Monaco, monospace` for code/content viewing
- **UI Text:** System font stack for readability in buttons, metadata

### Icon Set (pixelarticons needed)
| Context | Icon Name |
|---------|-----------|
| Browse nav | `folder` |
| Settings nav | `coin` (gear-like) or `sliders` |
| File card (.txt) | `file` or `note` |
| File card (.pdf) | `file-alt` |
| File card (.csv) | `table` |
| File card (.json) | `code` |
| File card (.md) | `article` |
| Search bar | `search` |
| Close popup | `close` |
| Export | `download` |
| Copy | `clipboard` |
| Delete | `trash` |
| Upload / drop | `upload` |
| Light mode | `sun` |
| Dark mode | `moon` |
| Warning | `alert` |
| Drag indicator | `drag` |

## Technical Considerations

- **Component structure:** Consider splitting `+page.svelte` (currently 1500+ lines) into smaller Svelte components:
  - `Sidebar.svelte` — left nav
  - `FileBrowser.svelte` — grid of file cards
  - `FileCard.svelte` — individual card
  - `FileViewer.svelte` — overlay popup
  - `SearchBar.svelte` — floating search
  - `EntityPanel.svelte` — right panel entity view
  - `SettingsScreen.svelte` — settings center content
  - `ConfirmDialog.svelte` — delete confirmation
  - `PixelIcon.svelte` — reusable icon wrapper
- **Theme system:** Use `data-theme` attribute on `<html>` controlled by a Svelte store. CSS custom properties for all colors. localStorage for persistence. Check `prefers-color-scheme` for "system" mode.
- **Search implementation:** The search bar needs access to file names (available in the items list) and masked content (requires calling `get_item` for each file, or caching content on first load). For iteration 1, search by name only is acceptable; content search can be deferred if it requires significant backend changes.
- **Overlay positioning:** The file viewer overlay popup must use `position: absolute` relative to the center panel (which needs `position: relative`), NOT `position: fixed` on the viewport. This ensures it stays within the center area bounds.
- **pixelarticons:** Download the specific SVGs needed from the GitHub repo and inline them as Svelte components. No npm package dependency needed.
- **Google Fonts:** Load "Press Start 2P" via `@import` in CSS or a `<link>` tag in `app.html`.
- **Existing Tauri commands remain unchanged:** `list_items`, `get_item`, `save_item`, `delete_item`, `export_file`, `export_zip`, `export_masked_pdf`, `read_file_text`, `read_file_bytes`, `extract_pdf_text`.

## Success Metrics

- All existing functionality (file ingestion, viewing, masking toggle, copy, export, delete) works identically to the current version
- The app is visually recognizable as pixel art / Mistral-inspired at first glance
- Dark and light themes both feel polished with the warm color palette
- File viewer popup correctly stays constrained within the center area
- Search bar filters the file grid without noticeable lag
- No accessibility regressions (keyboard navigation, screen reader labels)

## Open Questions

- Should the left sidebar be collapsible (icon-only vs icon+text)?
- Should the file browser remember the last opened file across sessions?
- Should we add keyboard shortcuts for common actions (e.g., `/` to focus search, `Cmd+N` for new paste)?
- For content search: should we search masked content only (safe) or raw content (privacy concern if displayed in search results)?
- Should the "Export All" action move to a toolbar in the file browser header or stay somewhere in the nav?
