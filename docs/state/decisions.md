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
