# In-note Task Views — Milestone 1 (pure engine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure, unit-tested task engine — extract structured tasks from note markdown, and safely compute status-toggle edits — that later milestones (sidebar, footer) render and drive.

**Architecture:** Two dependency-free modules. `task-extract.ts` scans markdown into `ExtractedTask[]` (status, text, line, raw, due/priority), skipping fenced code blocks. `task-write.ts` provides pure helpers to locate a checkbox's status span, compute the next status char (done↔todo), and produce an EOL-preserving single-character edit with strict, non-fuzzy line verification. No Obsidian APIs in this milestone.

**Tech Stack:** TypeScript (ES2021, ESM), Vitest. Follows the existing pure modules `src/task-parser.ts` and `src/task-count.ts`.

## Global Constraints

- Working directory for all paths/commands: `~/Documents/Tomasz/.obsidian/plugins/wayfinder-explorer`.
- These two modules are **pure**: no `import` from `'obsidian'`.
- `Priority` type is imported from `./task-parser` (values: `'highest' | 'high' | 'medium' | 'low' | 'lowest'`).
- **EOL preservation:** never `split('\n').join('\n')` on file content; edit by character offset so `\r\n` and all bytes are preserved.
- **Non-fuzzy write-back:** an edit proceeds only if the target line equals `expectedRaw` exactly (after stripping a single trailing `\r`); otherwise `{ ok: false }`.
- **Toggle is binary done↔todo:** `x`/`X` → `' '`; every other status char → `'x'`. No cycling of `/` or `-`.
- **Fence exactness:** an opening fence is `` ``` `` or `~~~` with up to three leading spaces; it closes only on the **same marker character** at **≥ the opening length**, with only trailing whitespace.
- `raw` on an `ExtractedTask` is the line text **without** any trailing `\r` or `\n` (matches Obsidian `editor.getLine`).
- Run a single test file with `npx vitest run <path>`.
- Every commit message ends with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

## File Structure

- Create `src/task-extract.ts` — task status model + `extractTasks(markdown)`.
- Create `src/task-extract.test.ts` — extractor tests.
- Create `src/task-write.ts` — `findStatusSpan`, `nextStatusChar`, `applyStatusToLine`.
- Create `src/task-write.test.ts` — write-engine tests.

---

## Task 1: Task status model + basic extraction

**Files:**
- Create: `src/task-extract.ts`
- Test: `src/task-extract.test.ts`

**Interfaces:**
- Consumes: `Priority` from `./task-parser`.
- Produces:
  - `type TaskStatus = 'todo' | 'inProgress' | 'done' | 'cancelled' | 'other'`
  - `interface ExtractedTask { line: number; raw: string; statusChar: string; status: TaskStatus; text: string; due?: string; priority?: Priority }`
  - `function statusFromChar(ch: string): TaskStatus`
  - `function extractTasks(markdown: string): ExtractedTask[]`

- [ ] **Step 1: Write the failing test**

Create `src/task-extract.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { extractTasks, statusFromChar } from './task-extract';

describe('statusFromChar', () => {
	it('maps the core statuses and falls back to other', () => {
		expect(statusFromChar(' ')).toBe('todo');
		expect(statusFromChar('x')).toBe('done');
		expect(statusFromChar('X')).toBe('done');
		expect(statusFromChar('/')).toBe('inProgress');
		expect(statusFromChar('-')).toBe('cancelled');
		expect(statusFromChar('?')).toBe('other');
	});
});

describe('extractTasks — basic', () => {
	it('extracts checkboxes with status, text, line, and raw', () => {
		const md = ['# Note', '- [ ] first', 'prose', '  - [x] second done'].join('\n');
		const tasks = extractTasks(md);
		expect(tasks).toHaveLength(2);
		expect(tasks[0]).toMatchObject({
			line: 1,
			raw: '- [ ] first',
			statusChar: ' ',
			status: 'todo',
			text: 'first',
		});
		expect(tasks[1]).toMatchObject({
			line: 3,
			raw: '  - [x] second done',
			statusChar: 'x',
			status: 'done',
			text: 'second done',
		});
	});

	it('ignores plain bullets and non-list lines', () => {
		expect(extractTasks('- a bullet\n* another\n1. numbered\nplain')).toEqual([]);
	});

	it('strips a trailing CR from raw', () => {
		const tasks = extractTasks('- [ ] windows\r\n- [/] going');
		expect(tasks[0].raw).toBe('- [ ] windows');
		expect(tasks[1]).toMatchObject({ statusChar: '/', status: 'inProgress', text: 'going' });
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/task-extract.test.ts`
Expected: FAIL — `Failed to resolve import "./task-extract"` / module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/task-extract.ts`:

```ts
import type { Priority } from './task-parser';

export type TaskStatus = 'todo' | 'inProgress' | 'done' | 'cancelled' | 'other';

export interface ExtractedTask {
	/** 0-based line index; for jump and write-back. */
	line: number;
	/** Line text without trailing CR/LF; verified before any write. */
	raw: string;
	/** The single status character between the brackets. */
	statusChar: string;
	status: TaskStatus;
	/** Display text: checkbox marker removed, known Tasks emoji stripped. */
	text: string;
	due?: string;
	priority?: Priority;
}

/** ` `→todo, `x`/`X`→done, `/`→inProgress, `-`→cancelled, else→other. */
export function statusFromChar(ch: string): TaskStatus {
	if (ch === ' ') return 'todo';
	if (ch === 'x' || ch === 'X') return 'done';
	if (ch === '/') return 'inProgress';
	if (ch === '-') return 'cancelled';
	return 'other';
}

// Capture: (1) prefix up to and incl. "[", (2) status char, (3) "] ", (4) body.
const TASK_RE = /^([ \t]*[-*+] \[)([^\]])(\] )(.*)$/;

export function extractTasks(markdown: string): ExtractedTask[] {
	const lines = markdown.split('\n');
	const tasks: ExtractedTask[] = [];
	for (let i = 0; i < lines.length; i++) {
		const raw = lines[i].replace(/\r$/, '');
		const m = TASK_RE.exec(raw);
		if (!m) continue;
		const statusChar = m[2];
		tasks.push({
			line: i,
			raw,
			statusChar,
			status: statusFromChar(statusChar),
			text: m[4].trim(),
		});
	}
	return tasks;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/task-extract.test.ts`
Expected: PASS (all three `extractTasks — basic` cases and `statusFromChar`).

- [ ] **Step 5: Commit**

```bash
git add src/task-extract.ts src/task-extract.test.ts
git commit -m "feat: task-extract status model and basic checkbox extraction

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: Skip fenced code blocks

**Files:**
- Modify: `src/task-extract.ts` (extend `extractTasks`)
- Test: `src/task-extract.test.ts` (add a describe block)

**Interfaces:**
- Consumes: everything from Task 1.
- Produces: no new exports; `extractTasks` now ignores checkboxes inside fenced code blocks.

- [ ] **Step 1: Write the failing test**

Append to `src/task-extract.test.ts`:

```ts
describe('extractTasks — fenced code blocks', () => {
	it('skips checkboxes inside ``` and ~~~ fences', () => {
		const md = [
			'- [ ] real',
			'```',
			'- [ ] inside backticks',
			'```',
			'~~~',
			'- [ ] inside tildes',
			'~~~',
			'- [x] also real',
		].join('\n');
		const tasks = extractTasks(md);
		expect(tasks.map((t) => t.text)).toEqual(['real', 'also real']);
	});

	it('does not close a longer fence on a shorter one', () => {
		const md = ['````', '```', '- [ ] still inside', '````', '- [ ] outside'].join('\n');
		expect(extractTasks(md).map((t) => t.text)).toEqual(['outside']);
	});

	it('honors fences indented up to three spaces', () => {
		const md = ['   ```', '- [ ] inside indented fence', '   ```', '- [ ] outside'].join('\n');
		expect(extractTasks(md).map((t) => t.text)).toEqual(['outside']);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/task-extract.test.ts`
Expected: FAIL — the "inside" checkboxes are extracted, so the `toEqual` arrays don't match.

- [ ] **Step 3: Write minimal implementation**

Replace the whole `extractTasks` function in `src/task-extract.ts` with this fence-aware version (add `OPEN_FENCE_RE` above it):

```ts
// Opening fence: ``` or ~~~ (3+), up to three leading spaces.
const OPEN_FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

export function extractTasks(markdown: string): ExtractedTask[] {
	const lines = markdown.split('\n');
	const tasks: ExtractedTask[] = [];
	let fence: { char: string; len: number } | null = null;

	for (let i = 0; i < lines.length; i++) {
		const raw = lines[i].replace(/\r$/, '');

		if (fence) {
			// Close only on same marker char, length >= opening, trailing ws only.
			const close = new RegExp(`^ {0,3}(\\${fence.char}{${fence.len},})\\s*$`);
			if (close.test(raw)) fence = null;
			continue;
		}
		const open = OPEN_FENCE_RE.exec(raw);
		if (open) {
			fence = { char: open[1][0], len: open[1].length };
			continue;
		}

		const m = TASK_RE.exec(raw);
		if (!m) continue;
		const statusChar = m[2];
		tasks.push({
			line: i,
			raw,
			statusChar,
			status: statusFromChar(statusChar),
			text: m[4].trim(),
		});
	}
	return tasks;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/task-extract.test.ts`
Expected: PASS (basic + fenced blocks).

- [ ] **Step 5: Commit**

```bash
git add src/task-extract.ts src/task-extract.test.ts
git commit -m "feat: skip fenced code blocks in task extraction

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: Parse due date and priority; clean display text

**Files:**
- Modify: `src/task-extract.ts` (add `parseMeta`, use it in the push)
- Test: `src/task-extract.test.ts` (add a describe block)

**Interfaces:**
- Consumes: everything from Tasks 1–2.
- Produces: no new exports; extracted tasks now populate `due`/`priority` and a stripped `text`.

- [ ] **Step 1: Write the failing test**

Append to `src/task-extract.test.ts`:

```ts
describe('extractTasks — due and priority metadata', () => {
	it('parses the due date and priority and strips them from text', () => {
		const t = extractTasks('- [ ] Ship it ⏫ 📅 2026-07-10')[0];
		expect(t.text).toBe('Ship it');
		expect(t.due).toBe('2026-07-10');
		expect(t.priority).toBe('high');
	});

	it('takes due only from the calendar emoji, not scheduled', () => {
		const t = extractTasks('- [ ] Prep ⏳ 2026-07-08 📅 2026-07-20')[0];
		expect(t.due).toBe('2026-07-20');
		expect(t.text).toBe('Prep');
	});

	it('leaves plain tasks without due/priority', () => {
		const t = extractTasks('- [ ] Just a task #tag')[0];
		expect(t.text).toBe('Just a task #tag');
		expect(t.due).toBeUndefined();
		expect(t.priority).toBeUndefined();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/task-extract.test.ts`
Expected: FAIL — `text` still contains the emoji/date, and `due`/`priority` are undefined.

- [ ] **Step 3: Write minimal implementation**

In `src/task-extract.ts`, add these constants and function above `extractTasks` (below `TASK_RE`):

```ts
const EMOJI_TO_PRIORITY: Record<string, Priority> = {
	'🔺': 'highest',
	'⏫': 'high',
	'🔼': 'medium',
	'🔽': 'low',
	'⏬': 'lowest',
};
// Date-bearing emoji; only the calendar (📅) yields `due`.
const DATE_EMOJI = ['📅', '⏳', '🛫', '✅', '➕'];

function parseMeta(body: string): { text: string; due?: string; priority?: Priority } {
	let text = body;
	let due: string | undefined;
	let priority: Priority | undefined;

	for (const [emoji, p] of Object.entries(EMOJI_TO_PRIORITY)) {
		if (text.includes(emoji)) {
			priority = p;
			text = text.split(emoji).join(' ');
		}
	}
	for (const emoji of DATE_EMOJI) {
		const re = new RegExp(`${emoji}\\s*(\\d{4}-\\d{2}-\\d{2})`, 'g');
		text = text.replace(re, (_m, date: string) => {
			if (emoji === '📅' && due === undefined) due = date;
			return ' ';
		});
	}
	text = text.replace(/\s+/g, ' ').trim();
	return { text, due, priority };
}
```

Then change the `tasks.push({...})` call inside `extractTasks` to use `parseMeta`:

```ts
		const statusChar = m[2];
		const meta = parseMeta(m[4]);
		tasks.push({
			line: i,
			raw,
			statusChar,
			status: statusFromChar(statusChar),
			text: meta.text,
			...(meta.due ? { due: meta.due } : {}),
			...(meta.priority ? { priority: meta.priority } : {}),
		});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/task-extract.test.ts`
Expected: PASS (all extractor describe blocks).

- [ ] **Step 5: Commit**

```bash
git add src/task-extract.ts src/task-extract.test.ts
git commit -m "feat: parse due/priority and clean display text in task extraction

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: Write engine — status span, toggle, EOL-preserving edit

**Files:**
- Create: `src/task-write.ts`
- Test: `src/task-write.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks (self-contained pure module).
- Produces:
  - `interface StatusSpan { start: number; end: number }`
  - `function findStatusSpan(lineText: string): StatusSpan | null`
  - `function nextStatusChar(statusChar: string): string`
  - `interface ApplyResult { ok: boolean; content?: string }`
  - `function applyStatusToLine(content: string, line: number, expectedRaw: string, newChar: string): ApplyResult`

- [ ] **Step 1: Write the failing test**

Create `src/task-write.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyStatusToLine, findStatusSpan, nextStatusChar } from './task-write';

describe('findStatusSpan', () => {
	it('locates the status column in a checkbox line', () => {
		expect(findStatusSpan('- [ ] a')).toEqual({ start: 3, end: 4 });
		expect(findStatusSpan('  - [/] b')).toEqual({ start: 5, end: 6 });
	});
	it('returns null for non-checkbox lines', () => {
		expect(findStatusSpan('- a bullet')).toBeNull();
		expect(findStatusSpan('plain text [x]')).toBeNull();
	});
});

describe('nextStatusChar — binary done<->todo', () => {
	it('unchecks done and checks everything else', () => {
		expect(nextStatusChar('x')).toBe(' ');
		expect(nextStatusChar('X')).toBe(' ');
		expect(nextStatusChar(' ')).toBe('x');
		expect(nextStatusChar('/')).toBe('x');
		expect(nextStatusChar('-')).toBe('x');
	});
});

describe('applyStatusToLine', () => {
	it('flips the status char on the right line', () => {
		const content = '# note\n- [ ] task\nmore';
		const r = applyStatusToLine(content, 1, '- [ ] task', 'x');
		expect(r.ok).toBe(true);
		expect(r.content).toBe('# note\n- [x] task\nmore');
	});

	it('preserves CRLF line endings, changing only the status char', () => {
		const content = '- [ ] a\r\n- [ ] b\r\n';
		const r = applyStatusToLine(content, 1, '- [ ] b', 'x');
		expect(r.ok).toBe(true);
		expect(r.content).toBe('- [ ] a\r\n- [x] b\r\n');
	});

	it('aborts (no write) when the line no longer matches expectedRaw', () => {
		const content = '- [ ] changed since render';
		expect(applyStatusToLine(content, 0, '- [ ] stale', 'x')).toEqual({ ok: false });
	});

	it('aborts when the line index is out of range', () => {
		expect(applyStatusToLine('- [ ] only', 5, '- [ ] only', 'x')).toEqual({ ok: false });
	});

	it('aborts when the matched line is not a checkbox', () => {
		expect(applyStatusToLine('plain line', 0, 'plain line', 'x')).toEqual({ ok: false });
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/task-write.test.ts`
Expected: FAIL — `Failed to resolve import "./task-write"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/task-write.ts`:

```ts
export interface StatusSpan {
	/** Column of the status char within the line. */
	start: number;
	/** Column just past the status char. */
	end: number;
}

// Same checkbox shape as the extractor: prefix, single status char, "] ".
const CHECKBOX_RE = /^([ \t]*[-*+] \[)([^\]])(\] )/;

/** Column span of the status character, or null if not a checkbox line. */
export function findStatusSpan(lineText: string): StatusSpan | null {
	const m = CHECKBOX_RE.exec(lineText);
	if (!m) return null;
	const start = m[1].length;
	return { start, end: start + m[2].length };
}

/** MVP toggle: `x`/`X` → space; every other status char → `x`. */
export function nextStatusChar(statusChar: string): string {
	return statusChar === 'x' || statusChar === 'X' ? ' ' : 'x';
}

export interface ApplyResult {
	ok: boolean;
	content?: string;
}

/**
 * Replace the status char on a 0-based line, preserving all line endings.
 * Non-fuzzy: proceeds only if the line equals expectedRaw (trailing CR
 * stripped for comparison) and is a real checkbox.
 */
export function applyStatusToLine(
	content: string,
	line: number,
	expectedRaw: string,
	newChar: string
): ApplyResult {
	let start = 0;
	for (let i = 0; i < line; i++) {
		const nl = content.indexOf('\n', start);
		if (nl === -1) return { ok: false };
		start = nl + 1;
	}
	let end = content.indexOf('\n', start);
	if (end === -1) end = content.length;

	let lineText = content.slice(start, end);
	if (lineText.endsWith('\r')) lineText = lineText.slice(0, -1);
	if (lineText !== expectedRaw) return { ok: false };

	const span = findStatusSpan(lineText);
	if (!span) return { ok: false };

	const statusStart = start + span.start;
	const statusEnd = start + span.end;
	return {
		ok: true,
		content: content.slice(0, statusStart) + newChar + content.slice(statusEnd),
	};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/task-write.test.ts`
Expected: PASS (findStatusSpan, nextStatusChar, applyStatusToLine).

- [ ] **Step 5: Run the full gate and commit**

Run: `npm run check`
Expected: typecheck + lint clean (pre-existing sentence-case warnings only), all tests pass, production build succeeds. Do **not** pipe this command through `head`/`tail` — that can SIGPIPE-kill the esbuild step before it writes `main.js`.

```bash
git add src/task-write.ts src/task-write.test.ts
git commit -m "feat: task-write status span, done<->todo toggle, EOL-safe edit

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage (milestone 1 scope):**
- Extractor data model → Task 1. ✅
- Status mapping (core four + other) → Task 1 (`statusFromChar`). ✅
- Fence exactness (≤3-space indent, same marker, ≥ length) → Task 2. ✅
- Due/priority parsing + display-text stripping → Task 3. ✅
- EOL-preserving, non-fuzzy, regex-anchored status-span edit → Task 4 (`applyStatusToLine`, `findStatusSpan`). ✅
- Binary done↔todo toggle → Task 4 (`nextStatusChar`). ✅
- `raw` is EOL-free → Task 1 (`.replace(/\r$/, '')`), verified by test. ✅
- Deferred to later milestones (correctly absent here): `toggleTaskStatus` app/editor wrapper, `task-view.ts` renderer, sidebar, query commands, footer, settings.

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every test step shows real assertions.

**Type consistency:** `ExtractedTask`, `TaskStatus`, `Priority`, `StatusSpan`, `ApplyResult` names and shapes are consistent across tasks. `findStatusSpan` returns `{start,end}` used only within Task 4. `nextStatusChar`/`applyStatusToLine` signatures match their tests. The checkbox regex is identical in `task-extract.ts` (`TASK_RE`) and `task-write.ts` (`CHECKBOX_RE`) in shape (the write copy omits the body capture, which is intentional and documented).
