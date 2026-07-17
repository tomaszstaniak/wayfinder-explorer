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
	/** True if the line carries a recurrence rule (🔁). */
	recurring?: boolean;
}

/** An extracted task paired with its source note path (index/pane model). */
export type IndexedTask = ExtractedTask & { path: string };

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

// Opening fence: ``` or ~~~ (3+), up to three leading spaces.
const OPEN_FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

const EMOJI_TO_PRIORITY: Record<string, Priority> = {
	'🔺': 'highest',
	'⏫': 'high',
	'🔼': 'medium',
	'🔽': 'low',
	'⏬': 'lowest',
};
// Date-bearing emoji; only the calendar (📅) yields `due`.
const DATE_EMOJI = ['📅', '⏳', '🛫', '✅', '➕'];

// A real recurrence: the 🔁 signifier followed by an "every …" rule — not a
// decorative 🔁 in the task text. (Optional emoji variation selector allowed.)
const RECURRENCE_RE = /🔁️?\s*every\b/i;

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

export function extractTasks(markdown: string): ExtractedTask[] {
	const lines = markdown.split('\n');
	const tasks: ExtractedTask[] = [];
	let fence: { char: string; len: number } | null = null;

	for (let i = 0; i < lines.length; i++) {
		const raw = lines[i]!.replace(/\r$/, '');

		if (fence) {
			// Close only on same marker char, length >= opening, trailing ws only.
			const close = new RegExp(`^ {0,3}(\\${fence.char}{${fence.len},})\\s*$`);
			if (close.test(raw)) fence = null;
			continue;
		}
		const open = OPEN_FENCE_RE.exec(raw);
		if (open) {
			const marker = open[1]!;
			fence = { char: marker[0]!, len: marker.length };
			continue;
		}

		const m = TASK_RE.exec(raw);
		if (!m) continue;
		const statusChar = m[2]!;
		const body = m[4]!;
		const meta = parseMeta(body);
		tasks.push({
			line: i,
			raw,
			statusChar,
			status: statusFromChar(statusChar),
			text: meta.text,
			...(meta.due ? { due: meta.due } : {}),
			...(meta.priority ? { priority: meta.priority } : {}),
			...(RECURRENCE_RE.test(body) ? { recurring: true } : {}),
		});
	}
	return tasks;
}
