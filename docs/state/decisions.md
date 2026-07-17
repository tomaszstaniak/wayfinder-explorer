# Decisions

Status: active
Date: 2026-07-12
Scope: durable product/architecture decisions

## Keep task features in this plugin for now

Task functionality is growing enough that a future `wayfinder-tasks` split makes sense, but not yet. Keep the modules clearly separated inside this plugin until the task product shape stabilizes.

Split later when the task side has a stable global pane/cache/settings story.

## Prefer Wayfinder-owned task views

Tasks-plugin query blocks are useful compatibility helpers, but they are not the core task UI. Large vaults with legacy checkboxes make whole-vault Tasks queries expensive.

Future global task work should use Wayfinder's extractor/cache/renderer with capped or virtualized rendering.

## Default new UI surfaces conservatively

New visible surfaces should avoid surprising users on update. The Tasks sidebar defaults off and is enabled through settings.

## Global task pane architecture (accepted 2026-07-15)

The cross-vault "all tasks" surface is a Wayfinder-owned pane, not a Tasks-plugin block. Accepted shape:

- **Separate incremental in-memory index**, plugin-owned, gated on `showGlobalTaskPane`. Do not unify with the folder-count scan yet; do not persist to disk (in-memory only) until measured startup/reindex cost warrants it.
- **Persisted content only** — the index never models unsaved editor buffers. Pane toggles patch the index optimistically (line+raw match); the next vault event reconciles.
- **Correctness by layered guards**: index epoch (start/stop lifecycle), per-path generation (per-file ordering), line+raw (optimistic patch), vault-event reconciliation. Vault create/modify/delete/rename are the only source of truth (`metadataCache.changed` omitted). Rename moves the entry (or schedules an update if absent). Transient read failures preserve last-good data; only genuinely-missing files are removed.
- **Bounded rendering** — cap matched rows (not groups); Show-more in batches. No windowed virtualization until a measured need appears.
- **Default grouping by note** (vault-native navigator); due/priority/status are alternate groupings. Deterministic sort tie-breakers so rows never jitter.
- **Tags deferred to v1.1**; an interim case-insensitive text query covers finding `#tag` text without structured semantics.
- Reuses the existing pure extractor and stale-guarded `toggleTaskStatus`; does not depend on the Tasks plugin.

## Migrating away from the community Tasks plugin; recurrence is a bridge (v0.6.0)

Direction: **now** Wayfinder task UI + optional Tasks-plugin helpers → **later** a Wayfinder-owned task engine → **eventually** a separate `wayfinder-tasks` plugin if warranted. The global pane is part of this migration.

Recurrence (`🔁`) is not free to own — it needs deliberate rules (syntax parsing, done-date stamping, next-occurrence calculation/insertion, overdue/custom-status handling, Tasks-syntax compatibility). Until we build that, the pane does **not** complete recurring tasks: a `🔁` row shows a recurrence control (not a checkbox) that opens the note with a Notice, letting the external Tasks plugin advance the recurrence correctly. We deliberately do **not** invoke the Tasks plugin's internals to do this — that would deepen the dependency we intend to remove. Ordinary tasks stay directly checkable in the pane.

## Retired the per-note Tasks sidebar (v0.6.0)

The global pane's "This note" scope supersedes the old per-note sidebar, so it was removed (view, `showTaskSidebar` setting, ribbon, `open-tasks-view` command, `task-sidebar.ts`, and the now-unused `renderTaskList`). Two overlapping task surfaces isn't worth maintaining. On load, any leaf restored from an old layout is detached via a one-time `detachLeavesOfType('wayfinder-tasks')`. Legacy `showTaskSidebar` values in saved settings are simply ignored.
