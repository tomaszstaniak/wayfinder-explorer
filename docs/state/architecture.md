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
- `task-view.ts`: Obsidian-agnostic grouped task DOM renderer.
- `task-sidebar.ts`: Obsidian `ItemView` for current-note tasks.
- `task-query.ts`: Tasks-plugin query block strings and cursor insertion wrapping.

## Dependency boundary

Wayfinder-owned task views use Wayfinder extraction/rendering/write-back. They do not require the Tasks plugin.

Tasks-plugin query blocks deliberately use Tasks syntax and only render when the Tasks plugin is enabled.
