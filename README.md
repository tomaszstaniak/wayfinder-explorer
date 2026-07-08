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

4. **Subfolder color schemes.** A colored folder can derive its direct
   subfolders' colors automatically: **shades** (same hue, stepped
   lightness), **analogous** (neighboring hues), or **spread**
   (golden-angle rotation — maximally distinct). Explicit child colors
   always win. And globally, folder colors can render as a **background
   wash** or as **text color** (Settings → "Apply folder colors as").
5. **Emphasis and badges.** Any folder can be *dimmed* (archive style:
   desaturated, reduced opacity, cascades with a per-subtree opt-out), and
   any folder can show a *count badge* — its item count in accent color
   whenever it's non-empty (an inbox pressure gauge).

Assignments survive renames and moves. Everything is theme-aware (icons use
`currentColor`; washes are `color-mix` over transparency) and works in light
and dark mode.

## PARA preset

If you organize with the PARA method, run **"Wayfinder: Apply PARA preset"**
from the command palette. It detects your root folders by name — numbered or
not ("01 Projects", "Projects", "Archived" all work) — shows what it found,
and on confirmation assigns colors along the **actionability gradient**:
Projects most saturated, Areas medium, Resources low, Archive dimmed and
colorless, Inbox with a count badge. It writes ordinary Wayfinder
assignments: adjust or undo any of it from the folder context menu.

## Tasks

Wayfinder doesn't replace the [Tasks](https://publish.obsidian.md/tasks/)
plugin — it makes it faster to *feed* and easier to *see*. Everything here
produces or reads standard Tasks-compatible markdown, so you keep Tasks'
querying, recurrence, and rendering intact.

### Faster capture — shorthand → Tasks line

Tasks' power lives behind an emoji syntax (`📅` due, `⏫` priority, `🔁`
recurrence) that's a chore to type. Wayfinder lets you write a humane
shorthand and compiles it to the canonical line:

| You type | Becomes |
|---|---|
| `Call dentist @tomorrow` | `- [ ] Call dentist 📅 2026-07-08` |
| `Submit report @friday !high` | `- [ ] Submit report ⏫ 📅 2026-07-10` |
| `Water plants *weekly` | `- [ ] Water plants 🔁 every week` |

The sigils:

- **`@date`** — due date: `@today`, `@tomorrow`, `@friday`, `@3d`, `@2w`,
  `@2026-07-15`. Use `@start:…` / `@sched:…` for start and scheduled dates.
- **`!priority`** — `!high` / `!!!` (highest) … `!low`, or `!1`–`!5`.
- **`*recurrence`** — `*daily`, `*weekly`, `*monthly`, or `*"every 2 weeks"`
  (quote anything custom).
- **`#tags`** pass straight through.

Two ways to run it:

1. **Quick add task** — command *"Wayfinder: Quick add task (shorthand)"*
   (or Settings → Tasks → **Add task…**). A single field with a **live
   preview** of the compiled line; Enter inserts it at your cursor. The
   opposite of a multi-field modal.
2. **Convert line to task** — command *"Wayfinder: Convert line to task
   (shorthand)"*. Type shorthand directly in a note and convert the current
   line (or a whole selection) in place. Bind either command to a hotkey.

Both also accept a line that's **already a checkbox** — `- [ ] …` or your
custom `- [/] …` (in-progress) — preserving its status and augmenting it, so
you can add `@friday` to an existing task too.

### At-a-glance counts — open tasks per folder

Turn on Settings → Tasks → **Show open-task counts** and every folder gains
a small accent **task pill** next to its name showing the number of
unfinished tasks (`- [ ]` todo and `- [/]` in-progress) anywhere in its
subtree. It's *additional* to the item count (which stays at the row's right
edge), reads only real checkboxes from note content — never plain bullets,
done, or cancelled — and updates live as you check things off.

### Excluding folders

Task counts follow symlinks, so a linked external repo full of `- [ ]`
checklists can flood the numbers. Right-click a folder → **Wayfinder →
Exclude from task counts** (shown when counts are on) to drop that subtree
from the rollup. Stored per folder; survives renames.

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
| Show open-task counts | off | Accent task pill per folder, additive to the item count |

## Controls

Right-click a **folder**: set/remove icon, 8 preset colors, custom color,
inherit color, no color for this subtree, count badge, and — when task
counts are on — exclude from task counts.
Right-click a **file**: set/remove icon.

Commands (bind to hotkeys): *Quick add task (shorthand)*, *Convert line to
task (shorthand)*, *Apply PARA preset*.

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
