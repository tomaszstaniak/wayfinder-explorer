# Current state

Status: active
Date: 2026-07-12
Scope: Wayfinder v0.3.x plugin state

Wayfinder is currently one Obsidian plugin focused on explorer readability and lightweight task surfaces.

## Shipped surfaces

- Explorer styling: contextual file/folder icons, cascading folder colors, folder count badges, empty-note icons, and editing indicator.
- Task capture: shorthand conversion for Tasks-plugin-compatible task lines.
- Task counts: open-task count rollups with per-folder exclusion.
- Tasks in note sidebar: Wayfinder-owned current-note task view with extraction, grouping, checkbox toggles, and jump-to-line.
- Tasks query block commands: optional Tasks-plugin-native blocks for current-note and vault dashboard use.

## Current direction

Wayfinder-owned task surfaces should not depend on the Tasks plugin for core behavior. Tasks-plugin query blocks are compatibility helpers, not the primary long-term task experience.

Likely next major task work is a Wayfinder-owned global task pane using the local extractor/cache/renderer. The in-document footer remains planned, but is lower priority than solving cross-vault task scale.
