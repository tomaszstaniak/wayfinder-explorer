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
		const raw = lines[i]!.replace(/\r$/, '');
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
