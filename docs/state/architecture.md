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
- `task-view.ts`: Obsidian-agnostic task DOM renderer — generic `renderTaskRow`, `renderTaskList` (sidebar), `renderGroupedTasks` (global pane).
- `task-sidebar.ts`: Obsidian `ItemView` for current-note tasks (superseded by the global pane's "This note" scope; retirement pending).
- `task-query.ts`: Tasks-plugin query block strings and cursor insertion wrapping.
- `task-obsidian.ts`: shared Obsidian-facing helpers (`markdownViewForPath`, `openTaskLocation`) used by both panes.
- `task-dates.ts`: pure date utilities (calendar validation, UTC day arithmetic, due buckets, local-today/next-midnight).
- `task-index.ts`: plugin-owned, Obsidian-agnostic incremental cross-vault task index (`Map<path, ExtractedTask[]>`), epoch + per-path generation guarded, injected IO; persisted content only.
- `task-filter.ts`: pure filter/group/sort/row-cap derivation feeding the global pane (deterministic ordering, capped matched rows).
- `task-global-view.ts`: Obsidian `ItemView` for the cross-vault global task pane (grouping, filters, bounded render, live-editor overlay, "This note" scope).

## Global task pane

The cross-vault task surface is Wayfinder-owned: a plugin-owned incremental `TaskIndex` (fed by `vault` create/modify/delete/rename, persisted content only) emits coalesced snapshots to `task-global-view.ts`, which derives a bounded view via pure `task-filter.ts` + `task-dates.ts` and renders capped rows with Show-more. The pane keeps a debounced, pane-local overlay of the active editor's live buffer (the index never caches unsaved content). Lifecycle is gated on `showGlobalTaskPane`; correctness rests on an index epoch (lifecycle), per-path generation (ordering), line+raw match (optimistic toggle patch), and vault-event reconciliation.

## Dependency boundary

Wayfinder-owned task views use Wayfinder extraction/rendering/write-back. They do not require the Tasks plugin.

Tasks-plugin query blocks deliberately use Tasks syntax and only render when the Tasks plugin is enabled.
