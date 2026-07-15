import { describe, expect, it, vi } from 'vitest';
import { TaskIndex, type TaskIndexIO, type TaskSnapshot } from './task-index';

/** Controllable scheduler: queues one pending flush; flush()/cancel() drive it. */
function fakeScheduler() {
	let pending: (() => void) | null = null;
	return {
		schedule(fn: () => void) {
			pending = fn;
		},
		cancel() {
			pending = null;
		},
		flush() {
			const p = pending;
			pending = null;
			if (p) p();
		},
		get pending() {
			return pending;
		},
	};
}

function makeIO(files: Record<string, string>, sched = fakeScheduler()) {
	const io: TaskIndexIO & { sched: typeof sched; files: Record<string, string> } = {
		files,
		sched,
		scheduler: sched,
		listMarkdownPaths: () => Object.keys(files),
		fileExists: (p) => p in files,
		readFile: async (p) => {
			if (!(p in files)) throw new Error('ENOENT');
			return files[p]!;
		},
	};
	return io;
}

const OPEN = '- [ ] a';

describe('TaskIndex — scan & snapshot', () => {
	it('indexes all files on start and reaches ready with one coalesced emit', async () => {
		const io = makeIO({ 'a.md': OPEN, 'b.md': '- [ ] b\n- [ ] c' });
		const idx = new TaskIndex(io);
		const seen: TaskSnapshot[] = [];
		idx.subscribe((s) => seen.push(s));
		await idx.start();
		const snap = idx.snapshot();
		expect(snap.state).toBe('ready');
		expect(snap.tasks).toHaveLength(3);
		expect(seen.map((s) => s.state)).toEqual(['idle', 'indexing', 'ready']);
	});

	it('subscribe fires an immediate snapshot and returns a working unsubscribe', async () => {
		const io = makeIO({ 'a.md': OPEN });
		const idx = new TaskIndex(io);
		const fn = vi.fn();
		const off = idx.subscribe(fn);
		expect(fn).toHaveBeenCalledTimes(1);
		off();
		await idx.start();
		expect(fn).toHaveBeenCalledTimes(1);
	});
});

describe('TaskIndex — incremental updates', () => {
	it('updateFile adds/replaces and coalesces via the scheduler', async () => {
		const io = makeIO({ 'a.md': OPEN });
		const idx = new TaskIndex(io);
		const fn = vi.fn();
		await idx.start();
		idx.subscribe(fn);
		fn.mockClear();
		io.files['a.md'] = '- [ ] a\n- [ ] a2';
		io.files['b.md'] = '- [ ] b';
		await idx.updateFile('a.md');
		await idx.updateFile('b.md');
		expect(io.sched.pending).not.toBeNull();
		io.sched.flush();
		expect(fn).toHaveBeenCalledTimes(1);
		expect(idx.snapshot().tasks).toHaveLength(3);
	});

	it('removeFile drops the entry', async () => {
		const io = makeIO({ 'a.md': OPEN });
		const idx = new TaskIndex(io);
		await idx.start();
		delete io.files['a.md'];
		idx.removeFile('a.md');
		io.sched.flush();
		expect(idx.snapshot().tasks).toHaveLength(0);
	});

	it('renameFile moves an existing entry without re-reading', async () => {
		const io = makeIO({ 'a.md': OPEN });
		const idx = new TaskIndex(io);
		await idx.start();
		const readSpy = vi.spyOn(io, 'readFile');
		io.files['b.md'] = io.files['a.md']!;
		delete io.files['a.md'];
		await idx.renameFile('a.md', 'b.md');
		io.sched.flush();
		expect(readSpy).not.toHaveBeenCalled();
		expect(idx.snapshot().tasks.map((t) => t.path)).toEqual(['b.md']);
	});

	it('renameFile with no existing entry delegates to updateFile', async () => {
		const io = makeIO({});
		const idx = new TaskIndex(io);
		await idx.start();
		io.files['b.md'] = OPEN;
		await idx.renameFile('a.md', 'b.md');
		io.sched.flush();
		expect(idx.snapshot().tasks.map((t) => t.path)).toEqual(['b.md']);
	});
});

describe('TaskIndex — correctness guards', () => {
	it('patchTaskStatus swaps status immutably and no-ops on mismatch', async () => {
		const io = makeIO({ 'a.md': OPEN });
		const idx = new TaskIndex(io);
		await idx.start();
		const before = idx.snapshot().tasks[0]!;
		idx.patchTaskStatus('a.md', before, 'x');
		io.sched.flush();
		const after = idx.snapshot().tasks[0]!;
		expect(after.statusChar).toBe('x');
		expect(after.status).toBe('done');
		expect(after.raw).toBe('- [x] a');
		idx.patchTaskStatus('a.md', { ...before, raw: '- [ ] stale' }, ' ');
		io.sched.flush();
		expect(idx.snapshot().tasks[0]!.statusChar).toBe('x');
	});

	it('stop() clears state, emits idle once, and cancels a queued flush', async () => {
		const io = makeIO({ 'a.md': OPEN });
		const idx = new TaskIndex(io);
		await idx.start();
		io.files['a.md'] = '- [ ] a\n- [ ] a2';
		await idx.updateFile('a.md');
		expect(io.sched.pending).not.toBeNull();
		idx.stop();
		expect(io.sched.pending).toBeNull();
		expect(idx.snapshot().state).toBe('idle');
		expect(idx.snapshot().tasks).toHaveLength(0);
	});

	it('a read that resolves after stop() does not repopulate (epoch guard)', async () => {
		let release!: (v: string) => void;
		const slow = new Promise<string>((res) => (release = res));
		const sched = fakeScheduler();
		const io: TaskIndexIO = {
			scheduler: sched,
			listMarkdownPaths: () => ['a.md'],
			fileExists: () => true,
			readFile: () => slow,
		};
		const idx = new TaskIndex(io);
		const startP = idx.start();
		idx.stop();
		release('- [ ] a');
		await startP;
		expect(idx.snapshot().tasks).toHaveLength(0);
		expect(idx.snapshot().state).toBe('idle');
	});

	it('transient read failure with the file still present preserves the last good entry', async () => {
		const io = makeIO({ 'a.md': OPEN });
		const idx = new TaskIndex(io);
		await idx.start();
		vi.spyOn(io, 'readFile').mockRejectedValueOnce(new Error('EBUSY'));
		await idx.updateFile('a.md');
		expect(idx.snapshot().tasks).toHaveLength(1);
	});
});
