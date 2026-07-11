# In-Note Task Views — M4: Query-Block Commands — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two command-palette actions that insert a Tasks-plugin ` ```tasks ` block at the cursor — one scoped to the current note, one a vault-wide dashboard — inserting even when the Tasks plugin is absent (with a Notice).

**Architecture:** A new pure module `src/task-query.ts` owns the exact block strings and the cursor-insertion wrapping (fully unit-tested so the confirmed Tasks query syntax is locked by a test). `main.ts` gains two thin `editorCallback` commands and a small insertion helper that also checks whether the Tasks plugin is enabled. No settings toggle — per spec, these commands are always available.

**Tech Stack:** TypeScript (ES2021 ESM), Obsidian API (`Editor`, `addCommand`, `Notice`), Vitest.

## Global Constraints

- `minAppVersion` stays `1.7.2`; no new API above that floor. (Commands + `Editor.replaceSelection`/`getCursor`/`getLine` are all well below it.)
- Confirmed against the **installed Tasks plugin v8.2.2** build: `filter by function` and the `query.file.path` function-scope variable both exist. The current-file filter is exact-match, not substring.
- UI copy: sentence case. Proper nouns "Tasks"/"Wayfinder" may trip the `obsidianmd/ui/sentence-case` lint — those are accepted pre-existing false positives, not errors.
- Wayfinder's engine/sidebar do **not** depend on the Tasks plugin; only these query blocks do (they insert Tasks-native syntax that the Tasks plugin renders).

---

### Task 1: Pure query-block module (`src/task-query.ts`)

**Files:**
- Create: `src/task-query.ts`
- Test: `src/task-query.test.ts`

**Interfaces:**
- Produces:
  - `TASKS_IN_NOTE_BLOCK: string` — the exact fenced block for the current note.
  - `TASKS_DASHBOARD_BLOCK: string` — the exact fenced block for a vault dashboard.
  - `blockInsertText(block: string, before: string): string` — wraps a block so it lands on its own line(s) at the cursor; `before` is the current line's text up to the cursor.

- [ ] **Step 1: Write the failing test**

```ts
// src/task-query.test.ts
import { describe, expect, it } from 'vitest';
import { TASKS_IN_NOTE_BLOCK, TASKS_DASHBOARD_BLOCK, blockInsertText } from './task-query';

describe('task-query — block content (locks Tasks 8.2.2 syntax)', () => {
	it('scopes the in-note block to the current file by exact path match', () => {
		expect(TASKS_IN_NOTE_BLOCK).toBe(
			['```tasks', 'not done', 'filter by function task.file.path === query.file.path', '```'].join('\n')
		);
	});

	it('builds a vault dashboard block grouped by file and sorted', () => {
		expect(TASKS_DASHBOARD_BLOCK).toBe(
			['```tasks', 'not done', 'group by filename', 'sort by priority, due', '```'].join('\n')
		);
	});
});

describe('task-query — blockInsertText', () => {
	it('adds no leading newline at the start of an empty line', () => {
		expect(blockInsertText('BLOCK', '')).toBe('BLOCK\n');
	});

	it('adds no leading newline when only whitespace precedes the cursor', () => {
		expect(blockInsertText('BLOCK', '   ')).toBe('BLOCK\n');
	});

	it('adds a leading newline when text precedes the cursor', () => {
		expect(blockInsertText('BLOCK', 'some text')).toBe('\nBLOCK\n');
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/task-query.test.ts`
Expected: FAIL — cannot resolve `./task-query`.

- [ ] **Step 3: Write the minimal implementation**

```ts
// src/task-query.ts

/**
 * Insert a Tasks-plugin query block scoped to the current note.
 * Uses the Tasks 8.2.2 `query` object for an EXACT current-file match
 * (`path includes` would be substring and could over-match).
 */
export const TASKS_IN_NOTE_BLOCK = [
	'```tasks',
	'not done',
	'filter by function task.file.path === query.file.path',
	'```',
].join('\n');

/** A vault-wide open-tasks dashboard, grouped by file and prioritized. */
export const TASKS_DASHBOARD_BLOCK = [
	'```tasks',
	'not done',
	'group by filename',
	'sort by priority, due',
	'```',
].join('\n');

/**
 * Wrap `block` so it always begins on its own line and ends with a newline.
 * `before` is the current line's text up to the cursor; a fence is only
 * recognized at line start, so prepend a newline when real text precedes it.
 */
export function blockInsertText(block: string, before: string): string {
	const leadingNewline = before.trim().length > 0 ? '\n' : '';
	return `${leadingNewline}${block}\n`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/task-query.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/task-query.ts src/task-query.test.ts
git commit -m "feat: pure task-query module (in-note + dashboard blocks, cursor wrapping)"
```

---

### Task 2: Wire the two insert commands (`src/main.ts`)

**Files:**
- Modify: `src/main.ts` (command registration block near line 147; add import + two private methods)

**Interfaces:**
- Consumes: `TASKS_IN_NOTE_BLOCK`, `TASKS_DASHBOARD_BLOCK`, `blockInsertText` from Task 1; `Editor` and `Notice` from `obsidian`.

- [ ] **Step 1: Add the import**

At the top of `src/main.ts`, add `Editor` to the existing `obsidian` import (leave `Notice` as-is if already imported), and import the query module:

```ts
import { TASKS_IN_NOTE_BLOCK, TASKS_DASHBOARD_BLOCK, blockInsertText } from './task-query';
```

- [ ] **Step 2: Register the two commands**

Immediately after the existing `open-tasks-view` command (around line 151), add:

```ts
this.addCommand({
	id: 'insert-tasks-in-note',
	name: 'Insert tasks-in-note query block',
	editorCallback: (editor) => this.insertTasksBlock(editor, TASKS_IN_NOTE_BLOCK),
});
this.addCommand({
	id: 'insert-tasks-dashboard',
	name: 'Insert vault tasks dashboard block',
	editorCallback: (editor) => this.insertTasksBlock(editor, TASKS_DASHBOARD_BLOCK),
});
```

- [ ] **Step 3: Add the insertion helper + plugin check**

Add these private methods to the plugin class (near the other task methods):

```ts
/** Insert a Tasks block at the cursor; warn if the Tasks plugin can't render it. */
private insertTasksBlock(editor: Editor, block: string): void {
	const cursor = editor.getCursor();
	const before = editor.getLine(cursor.line).slice(0, cursor.ch);
	editor.replaceSelection(blockInsertText(block, before));
	if (!this.isTasksPluginEnabled()) {
		new Notice(
			'Wayfinder: inserted a Tasks block, but the Tasks plugin is disabled — it will not render until you enable it.'
		);
	}
}

/** Whether the community Tasks plugin is installed and enabled. */
private isTasksPluginEnabled(): boolean {
	const plugins = (this.app as unknown as { plugins?: { enabledPlugins?: Set<string> } }).plugins;
	return plugins?.enabledPlugins?.has('obsidian-tasks-plugin') ?? false;
}
```

- [ ] **Step 4: Verify the build is green**

Run: `npm run check`
Expected: 0 errors; 178 tests pass (173 + 5 new); only the pre-existing sentence-case/prefer-create-el warnings (plus possibly one new sentence-case warning on the "Tasks" Notice — acceptable). Then confirm `main.js` mtime is fresh (`ls -l main.js`). Do NOT pipe the build through `head`/`tail`.

- [ ] **Step 5: Manual verification (Obsidian GUI — user-run)**

1. In a note with a few tasks, run **Insert tasks-in-note query block** with the cursor mid-line → the block lands on its own line and, with Tasks enabled, renders only that note's open tasks.
2. On an empty line, run it again → no stray leading blank line.
3. Run **Insert vault tasks dashboard block** on a scratch page → renders open tasks across the vault, grouped by file.
4. Disable the Tasks plugin, run either command → the block is still inserted **and** a Notice appears saying it won't render until Tasks is enabled.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts
git commit -m "feat: commands to insert tasks-in-note and vault-dashboard query blocks"
```

---

## Self-Review

- **Spec coverage:** Both commands (this-note + vault dashboard) ✓; exact current-file filter confirmed against installed Tasks 8.2.2 ✓; insert-anyway + Notice when Tasks missing ✓; no settings toggle (always available) ✓.
- **Placeholder scan:** None — all code is concrete.
- **Type consistency:** `blockInsertText(block, before)` signature identical in Task 1 definition, tests, and Task 2 call site; `insertTasksBlock`/`isTasksPluginEnabled` names consistent.
