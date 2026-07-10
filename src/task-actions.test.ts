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
		const process = vi.fn();
		const env: ToggleEnv = {
			editor: { getLine: () => '- [ ] a', replaceRange },
			disk: { process },
			notify: vi.fn(),
		};
		const outcome = await toggleTaskStatus(env, task({ text: 'a' }));
		expect(outcome).toBe('edited-buffer');
		expect(replaceRange).toHaveBeenCalledWith(0, 3, 4, 'x');
		expect(process).not.toHaveBeenCalled();
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
