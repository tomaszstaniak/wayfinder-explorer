# In-note task views — design

**Date:** 2026-07-09
**Status:** Approved (design), pending implementation plan

## Overview

Add three surfaces that expose the tasks *inside* notes, in the spirit of
Obsidian's "Backlinks in document" strip:

1. **Sidebar pane** — "Tasks in current note", follows the active note,
   grouped by status, checkable and click-to-jump.
2. **In-document footer** — the *same* rendered component, appearing at the
   bottom of notes that contain tasks.
3. **Drop-in query-block commands** — insert a Tasks-plugin ` ```tasks `
   block, in two flavors (this note / whole vault), for ad-hoc lists and a
   top-level "Tasks" dashboard page.

Surfaces 1 and 2 are **Wayfinder-owned UI** built on a shared engine and do
**not** depend on the Tasks plugin (though they parse its emoji metadata for
display). Surface 3 is intentionally Tasks-native and requires that plugin.

### Goals

- One shared, pure task **extractor** feeding the sidebar and footer.
- A lightweight Markdown **task controller**: toggle status and jump to line.
- Independent, settings-gated surfaces.

### Non-goals (explicit)

- **No duplication of Tasks-plugin completion semantics.** Toggling flips the
  status character only; it does **not** add a `✅` done-date, handle
  recurrence, or apply settings-driven behavior. Users who want Tasks-native
  completion use the query-block surface. Wayfinder's sidebar/footer is a
  lightweight Markdown task controller, not a Tasks reimplementation.
- **No reading-mode footer in MVP.** The footer is a CodeMirror (source +
  Live Preview) surface only. Reading-mode support needs a separate
  post-processor with its own lifecycle and is deferred.
- No fuzzy matching on write-back (see Write-back).

## Architecture — modules

- `task-extract.ts` **(pure)** — `extractTasks(markdown) → ExtractedTask[]`,
  status mapping, next-status logic. Skips fenced code blocks.
- `task-write.ts` — `applyStatusToLine(...)` **(pure)** plus a thin
  `toggleTaskStatus(app, file, task)` wrapper that does the I/O.
- `task-view.ts` — `renderTaskList(container, tasks, handlers)`: the shared
  grouped-by-status DOM renderer used by **both** the sidebar and the footer.
- `task-sidebar.ts` — `WayfinderTasksView extends ItemView`.
- `task-footer.ts` — CodeMirror editor extension (built last).
- Wiring in `main.ts`: register view, ribbon icon, commands, editor
  extension, and settings.

## Data model

```ts
type TaskStatus = 'todo' | 'inProgress' | 'done' | 'cancelled' | 'other';

interface ExtractedTask {
  line: number;        // 0-based; used for jump and write-back
  raw: string;         // full original line text; verified before any write
  statusChar: string;  // ' ' | 'x' | '/' | '-' | custom
  status: TaskStatus;
  text: string;        // display text (checkbox marker + trailing emoji stripped)
  due?: string;        // parsed from 📅, for a compact chip
  priority?: Priority; // parsed from priority emoji, for a compact chip
}
```

`Priority` reuses the existing type from `task-parser.ts`.

## Extractor (`task-extract.ts`)

- Pure line scan over the note's markdown.
- Matches real checkboxes only: `^[ \t]*[-*+] \[(.)\] ` — the same shape used
  by `task-count.ts`, but capturing the status character (any single char),
  not just open ones.
- **Skips fenced code blocks** (track ` ``` ` / `~~~` fences) so checkboxes in
  code samples (e.g. crossgate plans) are not treated as tasks.
- `text` is the line with the checkbox marker removed and trailing Tasks emoji
  metadata stripped for display; `raw` keeps the untouched original.
- Parses `📅 YYYY-MM-DD` → `due` and the five priority emoji → `priority` for
  display chips. Other emoji are left in/stripped as needed but not modeled in
  MVP.
- **Status mapping:** ` ` → todo, `x`/`X` → done, `/` → inProgress, `-` →
  cancelled, anything else → other. If the Tasks plugin is installed, its
  `statusSettings` provide group **labels**; the core four are the fallback.

## Write-back (`task-write.ts`)

Pure core, explicit and non-fuzzy:

```
applyStatusToLine(content, line, expectedRaw, newChar):
  split content into lines
  if lines[line] !== expectedRaw  → return { ok: false }   // no fuzzy matching
  replace the status char in lines[line] with newChar
  return { ok: true, content: lines.join('\n') }
```

`toggleTaskStatus(app, file, task)`:
1. Read the current file content.
2. Compare `lines[task.line] === task.raw`. If not equal → **abort**,
   re-extract (so the view refreshes to reality), and show a Notice. No write.
3. Otherwise compute the next status char and write via `vault.process`
   (atomic read-modify-write).

**Toggle logic (MVP): done ↔ todo, binary.**
- `x` / `X` → ` ` (space)
- every non-done status (todo, in-progress `/`, cancelled `-`) → `x`

The `/` and `-` statuses are **not** cycled in MVP; introducing a cycle
requires a dedicated UX control, which is out of scope here.

## Shared renderer (`task-view.ts`)

`renderTaskList(container, tasks, handlers, opts)`:
- Groups tasks by status; each group has a header with its count
  (`Todo (2)`, `In Progress (1)`, `Done (1)`, …), ordered
  todo → inProgress → done → cancelled → other.
- Each row: a real `<input type="checkbox">` reflecting done-ness, the task
  `text`, and compact chips for `due` / `priority` when present.
- Handlers: `onToggle(task)` and `onJump(task)`. The renderer is
  Obsidian-agnostic (takes handlers, builds DOM), so it is jsdom-testable and
  shared verbatim by the sidebar and footer.

## Sidebar (`task-sidebar.ts`) — ship first

- `ItemView` with a dedicated view type; opened via a ribbon icon and a
  command.
- Tracks the **active note**; re-extracts and re-renders on `file-open`,
  `active-leaf-change`, and `metadata`/vault `changed`, debounced.
- Reads note content via `cachedRead`.
- Uses `renderTaskList` with `onToggle`/`onJump` wired to `task-write` and a
  jump helper.

## Query-block commands (same pass as sidebar)

Two commands that insert a Tasks-native ` ```tasks ` block at the cursor:
- **Tasks in this note** — a block scoped to the current file via a
  **current-file path filter** (exact Tasks query syntax confirmed at
  implementation time; do not hard-commit the filter line in this spec).
- **Tasks dashboard (vault)** — a broader block (e.g. not-done, grouped,
  sorted) suitable for a top-level dashboard page.

These use the Tasks plugin's renderer and therefore require it; the sidebar,
footer, and extractor do not.

## Footer (`task-footer.ts`) — build last

- CodeMirror block-widget decoration positioned at document end, so it scrolls
  with content like the backlinks strip.
- DOM built by the shared `renderTaskList`.
- Shown **only when the note contains tasks**; hidden otherwise.
- Debounced re-render on document changes; also refreshes on external
  metadata changes.
- Wrapped in try/catch so a rendering failure can never break the editor.
- **Editor modes only (source + Live Preview).** Reading mode deferred.

## Settings (under the existing "Tasks" section)

- **Tasks sidebar** (on/off) — enables/disables the whole pane surface
  (ribbon icon + registration). When off, the pane is not available; the
  command may either be hidden or open with an explanatory Notice
  (decided at implementation).
- **Task footer in notes** (on/off) — the CodeMirror footer.
- Query-block commands are always available (no toggle).

## Error handling

- Extractor is total: non-matching lines are ignored; code-fence tracking
  prevents false positives.
- Write-back is guarded by exact line-content verification; on mismatch it
  aborts, refreshes, and notifies — never writes to the wrong line.
- Footer rendering is try/catch-isolated from the editor.
- All re-extraction is debounced and scoped to a single note (cheap).

## Testing

Pure, unit-tested:
- `extractTasks`: statuses, emoji parsing (due/priority), code-fence skipping,
  indentation, document order, non-task lines ignored.
- Status mapping and next-status (`done ↔ todo`) logic.
- `applyStatusToLine`: success, and the mismatch/abort path (no write).

DOM (jsdom):
- `renderTaskList`: grouping + counts, chips, checkbox reflects done-ness,
  handler wiring (`onToggle`/`onJump` fire with the right task).

Not unit-tested (consistent with the codebase): the `ItemView` and CodeMirror
view wiring, exercised manually.

## Sequencing (A architecture, C risk-ordering)

1. `task-extract.ts` + `task-write.ts` (pure engine) + tests.
2. `task-view.ts` shared renderer + jsdom test.
3. **Sidebar** — lowest-risk, immediately useful.
4. **Query-block commands** — simple, Tasks-native.
5. **Footer** — riskiest (CodeMirror plumbing), on the same renderer.

## Deferred / open

- Reading-mode footer (post-processor) — separate surface, separate lifecycle.
- Optional `✅` done-date / status cycling — needs explicit UX; out of MVP.
- Exact Tasks query filter strings — confirmed during implementation.
