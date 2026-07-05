# Wayfinder

An Obsidian plugin that makes the core file explorer readable, the way
Notion's or VS Code's sidebars are — with zero configuration.

## What it does

1. **Contextual icons by default.** Folders get a folder icon. Files get an
   icon matching their type: notes, PDFs, images, audio, video, canvases,
   Excalidraw drawings, spreadsheets, archives, code. No setup.
2. **Manual icon overrides.** Right-click any file or folder → **Wayfinder →
   Set icon…** and pick from Obsidian's bundled Lucide set (~1,500 icons).
3. **Folder color identity.** Give a folder a color: its name, a vertical
   "main line", and a subtle background wash mark its entire subtree.
   Colors cascade; any descendant folder can override with its own color or
   opt out entirely ("No color for this subtree").

Assignments survive renames and moves. Everything is theme-aware (icons use
`currentColor`; washes are `color-mix` over transparency) and works in light
and dark mode.

## How it works

Wayfinder never touches the file explorer's DOM. It keeps a small data store
(`data.json`) and compiles it into a single `<style data-wayfinder>` element.
Disable the plugin and every trace is gone.

## Settings

| Setting | Default | Meaning |
|---|---|---|
| Default file icons | on | Contextual icon per file type |
| Default folder icons | on | Folder icon on every folder |
| Background tint strength | 9% | Wash intensity; 0 disables the wash |
| Main line width | 2px | The colored vertical line |
| Folder item counts | off | Count per folder, monospace, right-aligned |
| Count mode | items | "Items inside" (direct children) or "Notes in subtree" |

## Controls

Right-click a **folder**: set/remove icon, 8 preset colors, custom color,
inherit color, no color for this subtree.
Right-click a **file**: set/remove icon.

## Data

Stored in `.obsidian/plugins/wayfinder-explorer/data.json`: folder/file assignments by
vault path plus the settings above. Invalid entries are skipped with a
console warning, never crashing the explorer.

## Limitations

- Decorates only the core file explorer (not tabs, search, or third-party
  explorers such as Notebook Navigator). Search results and tab headers
  carry no path attributes in their DOM, so extending there requires a
  DOM-decoration layer — planned, not yet built.
- Kanban boards and Excalidraw drawings are recognized via their
  frontmatter (`kanban-plugin`, `excalidraw-plugin`); other `.md`-embedded
  types get the note icon.
- Minimum Obsidian version: 1.7.2 (`minAppVersion`). The CSS relies on
  `:has()` and `color-mix()`. Verified so far on Obsidian desktop (macOS);
  mobile is untested.

## Conflicts

Disable other explorer-decoration plugins (Iconize, Iconic) while using
Wayfinder — they paint the same rows and results will overlap.

## Development

```bash
npm install
npm run dev     # watch build
npm run check   # typecheck + lint + tests + production build
```

Built as a data store + pure CSS compiler; see `src/compiler.ts`. Tests run
with Vitest (`npm test`).
