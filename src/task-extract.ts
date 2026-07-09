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

// Opening fence: ``` or ~~~ (3+), up to three leading spaces.
const OPEN_FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

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
		tasks.push({
			line: i,
			raw,
			statusChar,
			status: statusFromChar(statusChar),
			text: m[4]!.trim(),
		});
	}
	return tasks;
}
