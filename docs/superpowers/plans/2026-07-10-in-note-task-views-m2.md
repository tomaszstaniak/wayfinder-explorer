# In-note Task Views — Milestone 2 (shared renderer) Implementation Plan

> **For agentic workers:** Implement task-by-task; each task is an independent TDD cycle (write test → see it fail → implement → see it pass → commit). Steps use checkbox (`- [ ]`) syntax. Any executor that follows the steps in order works.

**Goal:** A pure, Obsidian-agnostic renderer that turns `ExtractedTask[]` into grouped, interactive DOM — the shared UI used later by both the sidebar and the footer.

**Architecture:** One module, `task-view.ts`, exporting `renderTaskList(container, tasks, handlers)`. It uses **standard DOM API only** (`container.ownerDocument.createElement`), never Obsidian's `createEl`, so it works in jsdom tests and in the Electron runtime alike. No sidebar, settings, commands, or footer wiring in this milestone.

**Tech Stack:** TypeScript (ES2021, ESM), Vitest with per-file jsdom.

## Global Constraints

- Working directory for all paths/commands: `~/Documents/Tomasz/.obsidian/plugins/wayfinder-explorer`.
- `task-view.ts` is **pure UI**: no `import` from `'obsidian'`. Create elements via `container.ownerDocument`.
- Consumes `ExtractedTask` / `TaskStatus` from `./task-extract` (M1).
- **Strict TypeScript** (`strict` + `noUncheckedIndexedAccess`): assert with `!` where a value is known-present; snippets below already include these.
- The test file **must** start with `// @vitest-environment jsdom` (global env is `node`).
- **Group order is fixed:** `todo`, `inProgress`, `done`, `cancelled`, `other`. Only non-empty groups render.
- Done checkbox is checked iff `task.status === 'done'`.
- Each `renderTaskList` call **replaces** the container's contents (idempotent).
- Run a single test file with `npx vitest run <path>`.
- **Commit attribution:** append whatever trailer your executor requires; none is hard-coded here.

---

## File Structure

- Create `src/task-view.ts` — `renderTaskList`, `TaskViewHandlers`.
- Create `src/task-view.test.ts` — jsdom rendering + interactivity tests.

---

## Task 1: Grouped rendering (structure, order, counts, checkbox, chips)

**Files:**
- Create: `src/task-view.ts`
- Test: `src/task-view.test.ts`

**Interfaces:**
- Consumes: `ExtractedTask` from `./task-extract`.
- Produces:
  - `interface TaskViewHandlers { onToggle(task: ExtractedTask): void; onJump(task: ExtractedTask): void }`
  - `function renderTaskList(container: HTMLElement, tasks: readonly ExtractedTask[], handlers: TaskViewHandlers): void`

DOM contract (classes are the test's stable surface):
- `.wf-task-group` per non-empty status group, in fixed order.
- Inside each: `.wf-task-group-header` → `.wf-task-group-label` (label text) + `.wf-task-group-count` (count).
- `.wf-task-row` per task → `input.wf-task-checkbox` + `.wf-task-text` + optional `.wf-task-chip.wf-task-priority` and `.wf-task-chip.wf-task-due`.

- [ ] **Step 1: Write the failing test**

Create `src/task-view.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { ExtractedTask } from './task-extract';
import { renderTaskList } from './task-view';

function task(partial: Partial<ExtractedTask> & { text: string }): ExtractedTask {
	return {
		line: 0,
		raw: `- [ ] ${partial.text}`,
		statusChar: ' ',
		status: 'todo',
		...partial,
	};
}

const handlers = { onToggle: vi.fn(), onJump: vi.fn() };

describe('renderTaskList — structure', () => {
	it('renders non-empty groups in fixed order with labels and counts', () => {
		const container = document.createElement('div');
		renderTaskList(
			container,
			[
				task({ text: 'a', status: 'done', statusChar: 'x' }),
				task({ text: 'b', status: 'todo' }),
				task({ text: 'c', status: 'todo' }),
			],
			handlers
		);
		const groups = [...container.querySelectorAll('.wf-task-group')];
		expect(groups).toHaveLength(2);
		// todo group comes before done group
		const labels = groups.map((g) => g.querySelector('.wf-task-group-label')!.textContent);
		expect(labels).toEqual(['Todo', 'Done']);
		const counts = groups.map((g) => g.querySelector('.wf-task-group-count')!.textContent);
		expect(counts).toEqual(['2', '1']);
	});

	it('renders one row per task with its text', () => {
		const container = document.createElement('div');
		renderTaskList(container, [task({ text: 'first' }), task({ text: 'second' })], handlers);
		const rows = [...container.querySelectorAll('.wf-task-row')];
		expect(rows.map((r) => r.querySelector('.wf-task-text')!.textContent)).toEqual([
			'first',
			'second',
		]);
	});

	it('checks the checkbox only for done tasks', () => {
		const container = document.createElement('div');
		renderTaskList(
			container,
			[task({ text: 'open' }), task({ text: 'closed', status: 'done', statusChar: 'x' })],
			handlers
		);
		const boxes = [...container.querySelectorAll<HTMLInputElement>('input.wf-task-checkbox')];
		expect(boxes.map((b) => b.checked)).toEqual([false, true]);
	});

	it('shows due and priority chips only when present', () => {
		const container = document.createElement('div');
		renderTaskList(
			container,
			[task({ text: 'dated', due: '2026-07-10', priority: 'high' }), task({ text: 'plain' })],
			handlers
		);
		const rows = [...container.querySelectorAll('.wf-task-row')];
		expect(rows[0]!.querySelector('.wf-task-due')!.textContent).toBe('2026-07-10');
		expect(rows[0]!.querySelector('.wf-task-priority')!.textContent).toBe('high');
		expect(rows[1]!.querySelector('.wf-task-chip')).toBeNull();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/task-view.test.ts`
Expected: FAIL — `Failed to resolve import "./task-view"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/task-view.ts`:

```ts
import type { ExtractedTask, TaskStatus } from './task-extract';

export interface TaskViewHandlers {
	onToggle(task: ExtractedTask): void;
	onJump(task: ExtractedTask): void;
}

const GROUP_ORDER: ReadonlyArray<{ status: TaskStatus; label: string }> = [
	{ status: 'todo', label: 'Todo' },
	{ status: 'inProgress', label: 'In Progress' },
	{ status: 'done', label: 'Done' },
	{ status: 'cancelled', label: 'Cancelled' },
	{ status: 'other', label: 'Other' },
];

/** Replace `container` with the tasks grouped by status. Standard DOM only. */
export function renderTaskList(
	container: HTMLElement,
	tasks: readonly ExtractedTask[],
	handlers: TaskViewHandlers
): void {
	const doc = container.ownerDocument;
	container.replaceChildren();

	for (const { status, label } of GROUP_ORDER) {
		const inGroup = tasks.filter((t) => t.status === status);
		if (inGroup.length === 0) continue;

		const group = doc.createElement('div');
		group.className = 'wf-task-group';

		const header = doc.createElement('div');
		header.className = 'wf-task-group-header';
		const labelEl = doc.createElement('span');
		labelEl.className = 'wf-task-group-label';
		labelEl.textContent = label;
		const countEl = doc.createElement('span');
		countEl.className = 'wf-task-group-count';
		countEl.textContent = String(inGroup.length);
		header.append(labelEl, countEl);
		group.append(header);

		for (const task of inGroup) {
			group.append(renderRow(doc, task, handlers));
		}
		container.append(group);
	}
}

function renderRow(
	doc: Document,
	task: ExtractedTask,
	handlers: TaskViewHandlers
): HTMLElement {
	const row = doc.createElement('div');
	row.className = 'wf-task-row';

	const checkbox = doc.createElement('input');
	checkbox.type = 'checkbox';
	checkbox.className = 'wf-task-checkbox';
	checkbox.checked = task.status === 'done';
	checkbox.addEventListener('click', () => handlers.onToggle(task));

	const textEl = doc.createElement('span');
	textEl.className = 'wf-task-text';
	textEl.textContent = task.text;
	textEl.addEventListener('click', () => handlers.onJump(task));

	row.append(checkbox, textEl);

	if (task.priority) {
		const chip = doc.createElement('span');
		chip.className = 'wf-task-chip wf-task-priority';
		chip.textContent = task.priority;
		row.append(chip);
	}
	if (task.due) {
		const chip = doc.createElement('span');
		chip.className = 'wf-task-chip wf-task-due';
		chip.textContent = task.due;
		row.append(chip);
	}
	return row;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/task-view.test.ts`
Expected: PASS (structure describe block).

- [ ] **Step 5: Commit**

```bash
git add src/task-view.ts src/task-view.test.ts
git commit -m "feat: task-view grouped renderer (order, counts, checkbox, chips)"
```

---

## Task 2: Interactivity and idempotent re-render

**Files:**
- Modify: `src/task-view.test.ts` (add a describe block)
- (No `task-view.ts` change expected — the handlers and `replaceChildren` are already wired in Task 1; this task proves that contract.)

**Interfaces:**
- Consumes: everything from Task 1.
- Produces: no new exports.

- [ ] **Step 1: Write the failing test**

Append to `src/task-view.test.ts`:

```ts
describe('renderTaskList — interactivity and re-render', () => {
	it('calls onToggle with the task when its checkbox is clicked', () => {
		const container = document.createElement('div');
		const onToggle = vi.fn();
		const t = task({ text: 'toggle me' });
		renderTaskList(container, [t], { onToggle, onJump: vi.fn() });
		container.querySelector<HTMLInputElement>('input.wf-task-checkbox')!.click();
		expect(onToggle).toHaveBeenCalledTimes(1);
		expect(onToggle).toHaveBeenCalledWith(t);
	});

	it('calls onJump with the task when its text is clicked', () => {
		const container = document.createElement('div');
		const onJump = vi.fn();
		const t = task({ text: 'jump to me' });
		renderTaskList(container, [t], { onToggle: vi.fn(), onJump });
		container.querySelector<HTMLElement>('.wf-task-text')!.click();
		expect(onJump).toHaveBeenCalledTimes(1);
		expect(onJump).toHaveBeenCalledWith(t);
	});

	it('replaces prior content on re-render (no stale rows)', () => {
		const container = document.createElement('div');
		renderTaskList(container, [task({ text: 'one' }), task({ text: 'two' })], handlers);
		expect(container.querySelectorAll('.wf-task-row')).toHaveLength(2);
		renderTaskList(container, [task({ text: 'only' })], handlers);
		const rows = [...container.querySelectorAll('.wf-task-row')];
		expect(rows).toHaveLength(1);
		expect(rows[0]!.querySelector('.wf-task-text')!.textContent).toBe('only');
	});
});
```

- [ ] **Step 2: Run test to verify it passes (contract already met)**

Run: `npx vitest run src/task-view.test.ts`
Expected: PASS. Task 1 already wired click handlers and `replaceChildren`; this block locks that behavior. If any case fails, fix `task-view.ts` minimally (do not change the DOM class contract).

- [ ] **Step 3: Run the full gate**

Run: `npm run check`
Expected: typecheck + lint clean (pre-existing sentence-case warnings only), all tests pass, production build succeeds. Do **not** pipe through `head`/`tail` (SIGPIPE can kill the esbuild step before it writes `main.js`).

- [ ] **Step 4: Commit**

```bash
git add src/task-view.test.ts
git commit -m "test: lock task-view interactivity and idempotent re-render"
```

---

## Self-Review

**Spec coverage (M2 design points):**
- Renderer takes `ExtractedTask[]` + `{ onToggle, onJump }` → Task 1 (`TaskViewHandlers`, `renderTaskList`). ✅
- Groups in stable order todo→inProgress→done→cancelled→other → Task 1 (`GROUP_ORDER`), tested. ✅
- Done checkbox checked iff `status === 'done'` → Task 1, tested. ✅
- Rows include text + optional due/priority chips → Task 1, tested. ✅
- Container cleared/replaced each render → Task 1 (`replaceChildren`), Task 2 test. ✅
- DOM tests for grouping, counts, checkbox state, chips, handler wiring → Tasks 1–2. ✅
- Out of scope (correctly absent): sidebar, settings, commands, footer.

**Placeholder scan:** none — every step has complete code.

**Type consistency:** `TaskViewHandlers`, `renderTaskList`, and the `ExtractedTask`/`TaskStatus` imports match M1's exports. Test helper `task()` builds valid `ExtractedTask` objects. `Task 2` adds no new exports, so no signature drift.
