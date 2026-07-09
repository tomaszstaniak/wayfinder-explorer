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
- **Skips fenced code blocks.** Fence detection must be exact: an opening
  fence is ` ``` ` or `~~~` with **up to three leading spaces**, and the block
  closes only on a fence of the **same marker character and at least the same
  length**. This avoids false toggles inside indented or longer fences (e.g.
  a ` ```` ` block containing ` ``` `).
- `text` is the line with the checkbox marker removed and trailing Tasks emoji
  metadata stripped for display; `raw` keeps the untouched original.
- Parses `📅 YYYY-MM-DD` → `due` and the five priority emoji → `priority` for
  display chips. Other emoji are left in/stripped as needed but not modeled in
  MVP.
- **Status mapping:** ` ` → todo, `x`/`X` → done, `/` → inProgress, `-` →
  cancelled, anything else → other. Group **labels** use built-in fallbacks
  ("Todo", "In Progress", "Done", "Cancelled") — sufficient for milestone 1.
  Reading the Tasks plugin's `statusSettings` for nicer labels is a
  **best-effort stretch (MVP-plus), never required**; surfaces 1/2 must work
  fully without the Tasks plugin installed.

## Write-back (`task-write.ts`)

Two rules dominate this section: **never normalize line endings**, and
**prefer the live editor buffer over the saved file** so we don't lag behind
or fight unsaved edits.

### Pure core — EOL-preserving, non-fuzzy

Do **not** `split('\n')` / `join('\n')` (that normalizes CRLF and loses exact
bytes). Instead replace the single status character by character offset:

```
applyStatusToLine(content, line, expectedRaw, newChar):
  walk `content` counting '\n' to find the start offset of `line`
  lineEnd = next '\n' (or end); lineText = content[start..lineEnd]
           with a single trailing '\r' stripped for comparison only
  if lineText !== expectedRaw            → { ok: false }   // no fuzzy matching
  bracket = index of "[" within lineText
  offset  = start + bracket + 1           // the status char between [ ]
  return { ok: true,
           content: content[0..offset] + newChar + content[offset+1..] }
```

This changes exactly one character and preserves every original line ending
and all surrounding text.

### Source selection — editor buffer first

`toggleTaskStatus(app, file, task)`:
1. If the file is open in a `MarkdownView`, operate on its **editor**:
   verify `editor.getLine(task.line) === task.raw` (EOL-free by construction),
   then `editor.replaceRange(newChar, {line, ch: bracket+1}, {line, ch:
   bracket+2})`. This edits the live buffer, preserves EOL, and never fights
   unsaved state.
2. Otherwise (no open editor) read the file, run `applyStatusToLine`, and if
   `ok` write via `vault.process` (atomic read-modify-write).
3. On any mismatch (`ok: false` or `getLine` ≠ `raw`) → **abort**, re-extract
   so the view refreshes to reality, and show a Notice. No write.

The **footer** always operates on its own CodeMirror document directly (it *is*
the editor), using the same line-verify + single-char replace.

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
  `active-leaf-change`, `editor-change`, and `metadata`/vault `changed`,
  debounced.
- **Extraction source:** when following the active editor, extract from the
  live buffer — `MarkdownView.editor.getValue()` — so the list reflects
  unsaved edits. Fall back to `cachedRead` only when no editor buffer is
  available (e.g. the active leaf is not a Markdown editor).
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
footer, and extractor do not. **Missing-plugin behavior:** if the Tasks plugin
is absent or disabled, still insert the block, but show a Notice that
rendering the block requires the Tasks plugin.

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

Views and the editor extension are **registered at plugin load** (the usual
Obsidian lifecycle). Settings gate *behavior*, not registration:

- **Tasks sidebar** (on/off) — controls **ribbon-icon visibility and whether
  the pane opens/renders**. When off, the ribbon icon is hidden and the pane
  does not render; the open command may be hidden or open with an explanatory
  Notice (decided at implementation). The view type stays registered.
- **Task footer in notes** (on/off) — the footer extension stays registered;
  the setting controls whether it renders anything.
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
- `extractTasks`: statuses, emoji parsing (due/priority), indentation,
  document order, non-task lines ignored, and **fence exactness** (checkboxes
  inside ` ``` `/`~~~` blocks skipped; a longer ` ```` ` fence not closed by a
  shorter ` ``` `; up-to-three-space-indented fences honored).
- Status mapping and next-status (`done ↔ todo`) logic.
- `applyStatusToLine`: success, the mismatch/abort path (no write), and
  **EOL preservation** — a CRLF document round-trips with only the status
  character changed and all `\r\n` intact.

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
