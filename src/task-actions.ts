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
		// Defensive: `line === task.raw` already matched a checkbox line, so a
		// null span is unreachable in practice — bail silently rather than edit.
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
