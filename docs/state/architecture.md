# Architecture

Status: active
Date: 2026-07-12
Scope: current plugin architecture

## Core areas

- Explorer customization lives in compiler/controller/store/style modules.
- Task parsing and rendering are isolated in task-specific modules.
- Settings are persisted through `Store` and surfaced in `WayfinderSettingTab`.

## Task modules

- `task-parser.ts`: shorthand-to-task-line conversion for quick capture.
- `task-count.ts`: lightweight open-task counting for explorer folder badges.
- `task-extract.ts`: pure Markdown task extractor used by Wayfinder-owned task views.
- `task-write.ts`: pure EOL-preserving status-character edits.
- `task-actions.ts`: injectable editor/disk toggle orchestration.
- `task-view.ts`: Obsidian-agnostic task DOM renderer — generic `renderTaskRow` shared by both panes, plus `renderTaskList` (sidebar) and `renderGroupedTasks` (global pane).
- `task-sidebar.ts`: Obsidian `ItemView` for current-note tasks.
- `task-query.ts`: Tasks-plugin query block strings and cursor insertion wrapping.
- `task-obsidian.ts`: shared Obsidian-facing helpers (`markdownViewForPath`, `openTaskLocation`) used by both panes.
- `task-index.ts`: plugin-owned, Obsidian-agnostic incremental cross-vault task index (`Map<path, ExtractedTask[]>`), epoch + per-path generation guarded, injected IO.
- `task-filter.ts`: pure filter/group/sort/slice derivation feeding the global pane (caps matched rows, deterministic ordering).
- `task-global-view.ts`: Obsidian `ItemView` for the cross-vault global task pane.

## Global task pane (M5)

The cross-vault task surface is Wayfinder-owned: a plugin-owned incremental in-memory `TaskIndex` (fed by `vault` create/modify/delete/rename, persisted content only) emits coalesced snapshots to the pane, which derives a bounded view via the pure `task-filter.ts` and renders capped rows with a Show-more control. Lifecycle is gated on the `showGlobalTaskPane` setting; correctness rests on an index epoch (lifecycle), per-path generation (ordering), line+raw match (optimistic toggle patch), and vault-event reconciliation. See the working spec `docs/superpowers/specs/2026-07-15-global-task-pane-design.md` (gitignored) for detail.

## Dependency boundary

Wayfinder-owned task views use Wayfinder extraction/rendering/write-back. They do not require the Tasks plugin.

Tasks-plugin query blocks deliberately use Tasks syntax and only render when the Tasks plugin is enabled.
