# In-note Task Views — Milestone 3 (sidebar) Implementation Plan

> **For agentic workers:** Implement task-by-task. Task 1 is a pure TDD cycle. Tasks 2–3 are Obsidian runtime wiring that cannot be unit-tested in jsdom/node — they end with a **manual verification checklist** plus `npm run check` (typecheck + lint + build). Steps use checkbox (`- [ ]`) syntax.

**Goal:** A right-sidebar "Tasks in current note" pane that follows the active note, renders its tasks via the M2 renderer, toggles status (write-back) and jumps to lines — gated by a setting.

**Architecture:** A pure, injectable `toggleTaskStatus` (new `task-actions.ts`) carries the risky write decision (editor-buffer first, disk fallback, non-fuzzy verify) so it stays unit-tested. `WayfinderTasksView` (an `ItemView`) owns lifecycle: it extracts from the live editor buffer (fallback `cachedRead`), renders with M2's `renderTaskList`, and refreshes on debounced workspace/vault events. The view type and setting register at plugin load; the setting gates ribbon visibility and rendering.

**Tech Stack:** TypeScript (ES2021, ESM), Obsidian API (min 1.7.2 — `vault.process` available), Vitest.

## Global Constraints

- Working directory for all paths/commands: `~/Documents/Tomasz/.obsidian/plugins/wayfinder-explorer`.
- `task-actions.ts` is **pure**: no `import` from `'obsidian'`; it takes injected IO.
- Reuse M1/M2: `extractTasks`/`ExtractedTask` (`task-extract`), `nextStatusChar`/`findStatusSpan`/`applyStatusToLine` (`task-write`), `renderTaskList`/`TaskViewHandlers` (`task-view`).
- **Strict TypeScript** (`strict` + `noUncheckedIndexedAccess`): assert with `!` where known-present; use `Array.from(...)` not spread over `NodeList`.
- **Editor buffer wins** over saved file for both extraction and write-back; `cachedRead`/`vault.process` are fallbacks only.
- **Non-fuzzy write-back:** verify the target line equals `task.raw` before editing; on mismatch, notify and refresh, never write.
- Register the view type and setting **at plugin load**; the **Tasks sidebar** setting gates ribbon visibility + rendering, not registration.
- Run a single test file with `npx vitest run <path>`.
- **Commit attribution:** append whatever trailer your executor requires; none is hard-coded here.

## Lifecycle decisions (review targets)

- **View registration:** `registerView(VIEW_TYPE, ...)` in `onload` (always). Ribbon icon added/removed per setting; open command always registered but shows a Notice when the setting is off.
- **Active-note tracking:** the view resolves the current note as `getActiveViewOfType(MarkdownView)?.file ?? workspace.getActiveFile()`. This is used only to pick *which* file to show — **not** to find its editor.
- **Editor is resolved by file path, not focus.** A shared helper `markdownViewForPath(app, path)` scans `getLeavesOfType('markdown')` for an open editor of that file. Both extraction and toggle use it, so clicking into the sidebar (which changes the active view) never demotes us to the disk path while the note is open with unsaved edits.
- **Extraction source:** if an editor for the resolved file is open, extract from its `editor.getValue()` (unsaved edits included); else `await vault.cachedRead(file)`.
- **Stale-read guard:** `refresh()` captures a monotonically increasing `refreshSeq` before its `await`; after the read it renders only if `seq` is still current and `listEl.isConnected` (pane not closed). Prevents an older `cachedRead` from overwriting a newer note's render, and prevents post-close DOM touches.
- **Debounce:** `debounce` from `obsidian`, 150 ms trailing, on refresh.
- **Refresh events** (registered in the view's `onOpen`, auto-cleaned on close): `workspace` `active-leaf-change`, `file-open`, `editor-change`; `metadataCache` `changed`; `vault` `modify`.
- **Toggle wrapper:** `toggleTaskStatus(env, task)` — editor path (found by path) uses `editor.getLine`/`replaceRange`; disk path uses `vault.process` and **aborts via a sentinel `Error` thrown inside the callback** so a mismatch performs *no write at all* (no mtime bump). Both verify `task.raw` first.
- **Jump wrapper:** open/reveal the note in an existing Markdown leaf for that file, or a new main-area tab (`getLeaf('tab')`) — **never** `getLeaf(false)` (which from the sidebar returns the sidebar leaf and would open the note inside the task pane).
- **Setting default:** `showTaskSidebar` defaults to **false** — a new surface is opt-in, so an update doesn't silently add a ribbon icon.
- **Setting/ribbon behavior:** setting off → ribbon hidden, open command shows Notice, any open task leaves detached.

---

## File Structure

- Create `src/task-actions.ts` — `toggleTaskStatus(env, task)` and its IO interfaces (pure).
- Create `src/task-actions.test.ts` — unit tests with fake IO.
- Create `src/task-sidebar.ts` — `VIEW_TYPE_TASKS`, `WayfinderTasksView extends ItemView`.
- Modify `src/main.ts` — register view, ribbon, command, settings wiring, activate/detach helpers.
- Modify `src/settings.ts` — "Tasks sidebar" toggle under the Tasks section.
- Modify `src/types.ts` + `src/store.ts` — `showTaskSidebar` setting (default true).
- Modify `styles.css` — minimal pane styles for `wayfinder-task-*`.

---

## Task 1: Pure toggle engine (`task-actions.ts`)

**Files:**
- Create: `src/task-actions.ts`
- Test: `src/task-actions.test.ts`

**Interfaces:**
- Consumes: `ExtractedTask` (`./task-extract`); `nextStatusChar`, `findStatusSpan`, `applyStatusToLine` (`./task-write`).
- Produces:
  - `interface EditorLineIO { getLine(line: number): string | null; replaceRange(line: number, chStart: number, chEnd: number, text: string): void }`
  - `interface DiskIO { process(transform: (content: string) => string | null): Promise<'wrote' | 'aborted'> }`
  - `interface ToggleEnv { editor: EditorLineIO | null; disk: DiskIO; notify(message: string): void }`
  - `type ToggleOutcome = 'edited-buffer' | 'wrote-file' | 'aborted'`
  - `function toggleTaskStatus(env: ToggleEnv, task: ExtractedTask): Promise<ToggleOutcome>`

- [ ] **Step 1: Write the failing test**

Create `src/task-actions.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { ExtractedTask } from './task-extract';
import { toggleTaskStatus, type ToggleEnv } from './task-actions';

function task(p: Partial<ExtractedTask> & { text: string }): ExtractedTask {
	const statusChar = p.statusChar ?? ' ';
	return {
		line: p.line ?? 0,
		statusChar,
		status: p.status ?? 'todo',
		text: p.text,
		raw: p.raw ?? `- [${statusChar}] ${p.text}`,
	};
}

const STALE = 'Task changed since it was listed; refreshing.';

describe('toggleTaskStatus — editor path', () => {
	it('replaces the status span in the buffer when the line matches', async () => {
		const replaceRange = vi.fn();
		const env: ToggleEnv = {
			editor: { getLine: () => '- [ ] a', replaceRange },
			disk: { process: vi.fn() },
			notify: vi.fn(),
		};
		const outcome = await toggleTaskStatus(env, task({ text: 'a' }));
		expect(outcome).toBe('edited-buffer');
		expect(replaceRange).toHaveBeenCalledWith(0, 3, 4, 'x');
		expect(env.disk.process).not.toHaveBeenCalled();
	});

	it('unchecks a done task (x -> space)', async () => {
		const replaceRange = vi.fn();
		const env: ToggleEnv = {
			editor: { getLine: () => '- [x] done', replaceRange },
			disk: { process: vi.fn() },
			notify: vi.fn(),
		};
		await toggleTaskStatus(env, task({ text: 'done', status: 'done', statusChar: 'x' }));
		expect(replaceRange).toHaveBeenCalledWith(0, 3, 4, ' ');
	});

	it('aborts and notifies when the buffer line no longer matches', async () => {
		const replaceRange = vi.fn();
		const notify = vi.fn();
		const env: ToggleEnv = {
			editor: { getLine: () => '- [ ] different now', replaceRange },
			disk: { process: vi.fn() },
			notify,
		};
		const outcome = await toggleTaskStatus(env, task({ text: 'a' }));
		expect(outcome).toBe('aborted');
		expect(replaceRange).not.toHaveBeenCalled();
		expect(notify).toHaveBeenCalledWith(STALE);
	});
});

describe('toggleTaskStatus — disk path', () => {
	it('writes via disk.process when no editor is open', async () => {
		const process = vi.fn(async (transform: (c: string) => string | null) => {
			const next = transform('- [ ] a');
			return next === null ? ('aborted' as const) : ('wrote' as const);
		});
		const env: ToggleEnv = { editor: null, disk: { process }, notify: vi.fn() };
		const outcome = await toggleTaskStatus(env, task({ text: 'a' }));
		expect(outcome).toBe('wrote-file');
		expect(process).toHaveBeenCalledTimes(1);
	});

	it('aborts and notifies when the disk line no longer matches', async () => {
		const process = vi.fn(async (transform: (c: string) => string | null) => {
			const next = transform('- [ ] changed');
			return next === null ? ('aborted' as const) : ('wrote' as const);
		});
		const notify = vi.fn();
		const env: ToggleEnv = { editor: null, disk: { process }, notify };
		const outcome = await toggleTaskStatus(env, task({ text: 'a' }));
		expect(outcome).toBe('aborted');
		expect(notify).toHaveBeenCalledWith(STALE);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/task-actions.test.ts`
Expected: FAIL — `Failed to resolve import "./task-actions"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/task-actions.ts`:

```ts
import type { ExtractedTask } from './task-extract';
import { applyStatusToLine, findStatusSpan, nextStatusChar } from './task-write';

export interface EditorLineIO {
	/** Line text (EOL-free), or null if the line is unavailable. */
	getLine(line: number): string | null;
	/** Replace columns [chStart, chEnd) on `line` with `text`. */
	replaceRange(line: number, chStart: number, chEnd: number, text: string): void;
}

export interface DiskIO {
	/** Atomically transform file content; return null from `transform` to abort. */
	process(transform: (content: string) => string | null): Promise<'wrote' | 'aborted'>;
}

export interface ToggleEnv {
	/** Non-null when the task's file is open in an editor (preferred path). */
	editor: EditorLineIO | null;
	disk: DiskIO;
	notify(message: string): void;
}

export type ToggleOutcome = 'edited-buffer' | 'wrote-file' | 'aborted';

const STALE_MESSAGE = 'Task changed since it was listed; refreshing.';

/** Toggle done<->todo for `task`, editor-buffer first, non-fuzzy. */
export async function toggleTaskStatus(
	env: ToggleEnv,
	task: ExtractedTask
): Promise<ToggleOutcome> {
	const newChar = nextStatusChar(task.statusChar);

	if (env.editor) {
		const line = env.editor.getLine(task.line);
		if (line !== task.raw) {
			env.notify(STALE_MESSAGE);
			return 'aborted';
		}
		const span = findStatusSpan(line);
		if (!span) return 'aborted';
		env.editor.replaceRange(task.line, span.start, span.end, newChar);
		return 'edited-buffer';
	}

	const result = await env.disk.process((content) => {
		const r = applyStatusToLine(content, task.line, task.raw, newChar);
		return r.ok ? r.content! : null;
	});
	if (result === 'aborted') {
		env.notify(STALE_MESSAGE);
		return 'aborted';
	}
	return 'wrote-file';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/task-actions.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/task-actions.ts src/task-actions.test.ts
git commit -m "feat: pure toggleTaskStatus with injectable editor/disk IO"
```

---

## Task 2: Sidebar view + registration + setting

**Files:**
- Create: `src/task-sidebar.ts`
- Modify: `src/types.ts` (add `showTaskSidebar`), `src/store.ts` (parse it), `src/settings.ts` (toggle), `src/main.ts` (register view, ribbon, command, activate/detach), `styles.css` (pane styles).

**Interfaces:**
- Consumes: `renderTaskList` (`./task-view`), `extractTasks` (`./task-extract`), `toggleTaskStatus` + IO types (`./task-actions`).
- Produces:
  - `const VIEW_TYPE_TASKS = 'wayfinder-tasks'`
  - `class WayfinderTasksView extends ItemView` with `refresh(): void`
  - `WayfinderData.settings.showTaskSidebar: boolean` (default `true`)

- [ ] **Step 1: Add the setting (types + store + default)**

In `src/types.ts`, add to `WayfinderSettings` (after `showTaskCounts`):

```ts
	/** Show the "Tasks in current note" sidebar pane and its ribbon icon. */
	showTaskSidebar: boolean;
```

In `DEFAULT_SETTINGS` (after `showTaskCounts: false,`) — **default off**, so an update doesn't silently add a ribbon:

```ts
	showTaskSidebar: false,
```

In `src/store.ts` `parseSettings`, add (after the `showTaskCounts` block):

```ts
		showTaskSidebar:
			typeof r.showTaskSidebar === 'boolean'
				? r.showTaskSidebar
				: DEFAULT_SETTINGS.showTaskSidebar,
```

- [ ] **Step 2: Create the view skeleton**

Create `src/task-sidebar.ts`:

```ts
import { App, ItemView, MarkdownView, Notice, TFile, WorkspaceLeaf, debounce } from 'obsidian';
import type WayfinderPlugin from './main';
import type { ExtractedTask } from './task-extract';
import { extractTasks } from './task-extract';
import { toggleTaskStatus, type ToggleEnv } from './task-actions';
import { renderTaskList } from './task-view';

export const VIEW_TYPE_TASKS = 'wayfinder-tasks';

/** An open Markdown editor for `path`, regardless of which view is focused. */
function markdownViewForPath(app: App, path: string): MarkdownView | null {
	for (const leaf of app.workspace.getLeavesOfType('markdown')) {
		const view = leaf.view;
		if (view instanceof MarkdownView && view.file?.path === path) return view;
	}
	return null;
}

export class WayfinderTasksView extends ItemView {
	private listEl!: HTMLElement;
	private refreshSeq = 0;
	private readonly debouncedRefresh = debounce(() => void this.refresh(), 150, false);

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: WayfinderPlugin
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_TASKS;
	}
	getDisplayText(): string {
		return 'Tasks in note';
	}
	getIcon(): string {
		return 'list-checks';
	}

	async onOpen(): Promise<void> {
		this.contentEl.addClass('wayfinder-tasks-pane');
		this.listEl = this.contentEl.createDiv({ cls: 'wayfinder-task-list' });

		const ws = this.plugin.app.workspace;
		this.registerEvent(ws.on('active-leaf-change', () => this.debouncedRefresh()));
		this.registerEvent(ws.on('file-open', () => this.debouncedRefresh()));
		this.registerEvent(ws.on('editor-change', () => this.debouncedRefresh()));
		this.registerEvent(this.plugin.app.metadataCache.on('changed', () => this.debouncedRefresh()));
		this.registerEvent(this.plugin.app.vault.on('modify', () => this.debouncedRefresh()));

		await this.refresh();
	}

	/** Re-read the active note and re-render its tasks (stale reads discarded). */
	async refresh(): Promise<void> {
		const seq = ++this.refreshSeq;
		const { file, text } = await this.activeSource();
		// Discard if a newer refresh started, or the pane closed mid-read.
		if (seq !== this.refreshSeq || !this.listEl.isConnected) return;

		if (!file) return this.renderEmpty('No note open.');
		const tasks = extractTasks(text);
		if (tasks.length === 0) return this.renderEmpty('No tasks in this note.');
		renderTaskList(this.listEl, tasks, {
			onToggle: (t) => void this.toggle(file, t),
			onJump: (t) => void this.jump(file, t.line),
		});
	}

	private renderEmpty(message: string): void {
		this.listEl.empty();
		this.listEl.createDiv({ cls: 'wayfinder-task-empty', text: message });
	}

	/** Prefer the live editor buffer for THIS file (found by path), else read disk. */
	private async activeSource(): Promise<{ file: TFile | null; text: string }> {
		const ws = this.plugin.app.workspace;
		const file = ws.getActiveViewOfType(MarkdownView)?.file ?? ws.getActiveFile();
		if (!file) return { file: null, text: '' };
		const view = markdownViewForPath(this.plugin.app, file.path);
		if (view) return { file, text: view.editor.getValue() };
		return { file, text: await this.plugin.app.vault.cachedRead(file) };
	}

	private async toggle(file: TFile, task: ExtractedTask): Promise<void> {
		const editor = markdownViewForPath(this.plugin.app, file.path)?.editor ?? null;
		const env: ToggleEnv = {
			editor: editor
				? {
						getLine: (line) =>
							line >= 0 && line < editor.lineCount() ? editor.getLine(line) : null,
						replaceRange: (line, s, e, text) =>
							editor.replaceRange(text, { line, ch: s }, { line, ch: e }),
					}
				: null,
			disk: {
				process: async (transform) => {
					// Sentinel abort: throwing before returning means vault.process
					// never writes, so a mismatch bumps no mtime.
					const abort = new Error('wayfinder-task-abort');
					try {
						await this.plugin.app.vault.process(file, (content) => {
							const next = transform(content);
							if (next === null) throw abort;
							return next;
						});
						return 'wrote';
					} catch (error) {
						if (error === abort) return 'aborted';
						throw error instanceof Error ? error : new Error(String(error));
					}
				},
			},
			notify: (m) => new Notice(m),
		};
		await toggleTaskStatus(env, task);
		await this.refresh();
	}

	/** Open/reveal the note in a Markdown leaf — never the sidebar pane. */
	private async jump(file: TFile, line: number): Promise<void> {
		const ws = this.plugin.app.workspace;
		const leaf = markdownViewForPath(this.plugin.app, file.path)?.leaf ?? ws.getLeaf('tab');
		await leaf.openFile(file, { eState: { line } });
		ws.revealLeaf(leaf);
	}
}
```

- [ ] **Step 3: Register view, ribbon, command, activate/detach in `main.ts`**

Add imports at the top of `src/main.ts`:

```ts
import { VIEW_TYPE_TASKS, WayfinderTasksView } from './task-sidebar';
```

In `onload` (after the settings tab is added), register and wire:

```ts
		this.registerView(VIEW_TYPE_TASKS, (leaf) => new WayfinderTasksView(leaf, this));
		this.syncTasksSidebar();
```

Add these methods to the plugin class:

```ts
	private tasksRibbonEl: HTMLElement | null = null;

	/** Apply the current showTaskSidebar setting to ribbon + open leaves. */
	syncTasksSidebar(): void {
		const on = this.store.state.settings.showTaskSidebar;
		if (on && !this.tasksRibbonEl) {
			this.tasksRibbonEl = this.addRibbonIcon('list-checks', 'Wayfinder tasks', () =>
				this.activateTasksView()
			);
		} else if (!on && this.tasksRibbonEl) {
			this.tasksRibbonEl.remove();
			this.tasksRibbonEl = null;
			this.app.workspace.detachLeavesOfType(VIEW_TYPE_TASKS);
		}
	}

	async activateTasksView(): Promise<void> {
		if (!this.store.state.settings.showTaskSidebar) {
			new Notice('Enable the Tasks sidebar in Wayfinder settings first.');
			return;
		}
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(VIEW_TYPE_TASKS)[0] ?? null;
		if (!leaf) {
			leaf = workspace.getRightLeaf(false);
			await leaf?.setViewState({ type: VIEW_TYPE_TASKS, active: true });
		}
		if (leaf) workspace.revealLeaf(leaf);
	}
```

Register the command alongside the other `addCommand` calls:

```ts
		this.addCommand({
			id: 'open-tasks-view',
			name: 'Open tasks in note (sidebar)',
			callback: () => void this.activateTasksView(),
		});
```

In the existing store `subscribe` (the one added for task counts), call `this.syncTasksSidebar()` so toggling the setting takes effect live. Add this line inside that subscribe callback:

```ts
			this.syncTasksSidebar();
```

- [ ] **Step 4: Add the setting toggle + minimal styles**

In `src/settings.ts`, under the existing **Tasks** heading (after "Show open-task counts"), add:

```ts
		new Setting(containerEl)
			.setName('Tasks sidebar')
			.setDesc('Show a sidebar pane listing the current note’s tasks, with a ribbon icon to open it.')
			.addToggle((t) =>
				t
					.setValue(s.showTaskSidebar)
					.onChange((v) => this.store.updateSettings({ showTaskSidebar: v }))
			);
```

Append to `styles.css`:

```css
.wayfinder-tasks-pane { padding: var(--size-4-2); }
.wayfinder-task-group { margin-bottom: var(--size-4-3); }
.wayfinder-task-group-header {
	display: flex;
	gap: var(--size-2-2);
	align-items: baseline;
	font-size: var(--font-smaller);
	color: var(--text-muted);
	text-transform: uppercase;
	letter-spacing: 0.03em;
	margin-bottom: var(--size-2-2);
}
.wayfinder-task-row { display: flex; align-items: center; gap: var(--size-2-2); padding: 2px 0; }
.wayfinder-task-text {
	background: none;
	border: none;
	padding: 0;
	text-align: left;
	color: var(--text-normal);
	cursor: pointer;
	flex: 1;
}
.wayfinder-task-text:hover { color: var(--text-accent); }
.wayfinder-task-chip {
	font-size: var(--font-smallest);
	color: var(--text-muted);
	background: var(--background-secondary);
	border-radius: var(--radius-s);
	padding: 0 5px;
}
.wayfinder-task-empty { color: var(--text-faint); font-size: var(--font-smaller); }
```

- [ ] **Step 5: Typecheck + build**

Run: `npm run check`
Expected: typecheck + lint clean (pre-existing sentence-case warnings only), all existing tests pass (Task 1 added 5), production build succeeds. Do **not** pipe through `head`/`tail`.

- [ ] **Step 6: Manual verification (Obsidian)**

Reload the plugin (toggle off/on in Community plugins). The sidebar defaults **off**, so first: Settings → Wayfinder → **Tasks sidebar** → on. Then verify:

1. A **ribbon icon** appears; clicking it opens the **Tasks in note** pane in the right sidebar.
2. Open a note with tasks → grouped list (Todo/In Progress/Done/…) with counts renders; a note with none shows "No tasks in this note."
3. Switch notes / type a new `- [ ] x` line → the pane updates within ~150 ms.
4. **Click into the pane, then** click a task's **checkbox** → the note's line flips (`- [ ]` ↔ `- [x]`) via the still-open editor (not the disk path), and the pane regroups. (Verifies editor-by-path.)
5. Click a task's **text** → the note is revealed in its Markdown tab (never inside the pane) and moves to that line.
6. Rapidly switch between two task-heavy notes → the pane always ends on the *current* note (no stale render).
7. Settings → **Tasks sidebar** off → ribbon disappears and the pane closes; the open command shows a Notice. Turn on → ribbon returns.

- [ ] **Step 7: Commit**

```bash
git add src/task-sidebar.ts src/main.ts src/settings.ts src/types.ts src/store.ts styles.css
git commit -m "feat: Tasks-in-note sidebar pane (follow active note, toggle, jump)"
```

---

## Task 3: Settings test + full gate + push

**Files:**
- Modify: `src/store.test.ts` (extend the settings round-trip if it asserts the full settings object).

**Interfaces:** none new.

- [ ] **Step 1: Keep the store settings test green**

If `src/store.test.ts` compares against a full settings object (it builds from `DEFAULT_SETTINGS`, so a new field is usually covered automatically), run it:

Run: `npx vitest run src/store.test.ts`
Expected: PASS. If it hard-codes a settings literal missing `showTaskSidebar`, add `showTaskSidebar: false` to that literal so it matches `DEFAULT_SETTINGS`.

- [ ] **Step 2: Full gate**

Run: `npm run check`
Expected: all green (pre-existing warnings only), build writes `main.js`. Do **not** pipe through `head`/`tail`.

- [ ] **Step 3: Commit any store-test adjustment**

```bash
git add src/store.test.ts
git commit -m "test: cover showTaskSidebar in settings round-trip"
```

(Skip this commit if no change was needed.)

- [ ] **Step 4: Push**

```bash
git push
```

---

## Self-Review

**Spec coverage (M3 scope):**
- Sidebar `ItemView`, follows active note → Task 2 (`WayfinderTasksView`, refresh events). ✅
- Editor-buffer-first extraction (**editor found by path**, not active view), `cachedRead` fallback → Task 2 (`markdownViewForPath`, `activeSource`). ✅
- Grouped render via M2 renderer → Task 2 (`renderTaskList`). ✅
- Toggle (editor-first by path, disk fallback, non-fuzzy, **sentinel abort = no write**) → Task 1 (`toggleTaskStatus`, unit-tested) + Task 2 env wiring. ✅
- Jump into a Markdown leaf (never the sidebar) → Task 2 (`jump`). ✅
- Stale-read ordering guard (`refreshSeq`) + post-close guard (`isConnected`) → Task 2 (`refresh`). ✅
- Register at load; setting (default **off**) gates ribbon/render → Task 2 (`registerView` + `syncTasksSidebar`). ✅
- Debounced refresh on workspace/vault/metadata events → Task 2. ✅

**Placeholder scan:** none — the view in Task 2 Step 2 is complete (async `activeSource`, guards, sentinel abort); no superseded stub remains.

**Type consistency:** `ToggleEnv`/`EditorLineIO`/`DiskIO` match between `task-actions.ts` and the view's env construction. `VIEW_TYPE_TASKS`, `WayfinderTasksView`, `showTaskSidebar` names are consistent across files. `renderTaskList` handler shape matches M2. Obsidian lifecycle methods (`onOpen`) keep their public visibility.

**Testability note:** Task 1 is fully unit-tested (the risky write decision). Tasks 2–3 are Obsidian runtime wiring verified by `npm run check` (types/build) + the manual checklist — no jsdom test can exercise `ItemView`/`WorkspaceLeaf`/`vault.process`.
