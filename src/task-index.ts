import { extractTasks, statusFromChar, type ExtractedTask, type IndexedTask } from './task-extract';
import { findStatusSpan } from './task-write';

export type IndexState = 'idle' | 'indexing' | 'ready';
export interface TaskSnapshot {
	state: IndexState;
	tasks: readonly IndexedTask[];
}
export interface IndexScheduler {
	schedule(fn: () => void): void;
	cancel(): void;
}
export interface TaskIndexIO {
	listMarkdownPaths(): string[];
	readFile(path: string): Promise<string>;
	fileExists(path: string): boolean;
	scheduler: IndexScheduler;
}

type Listener = (snap: TaskSnapshot) => void;
const SCAN_CHUNK = 25;

export class TaskIndex {
	private entries = new Map<string, ExtractedTask[]>();
	private generation = new Map<string, number>();
	private epoch = 0;
	private running = false;
	private state: IndexState = 'idle';
	private listeners = new Set<Listener>();

	constructor(private readonly io: TaskIndexIO) {}

	snapshot(): TaskSnapshot {
		const tasks: IndexedTask[] = [];
		for (const [path, list] of this.entries) {
			for (const t of list) tasks.push({ ...t, path });
		}
		return { state: this.state, tasks };
	}

	subscribe(fn: Listener): () => void {
		this.listeners.add(fn);
		fn(this.snapshot());
		return () => {
			this.listeners.delete(fn);
		};
	}

	private bump(path: string): number {
		const g = (this.generation.get(path) ?? 0) + 1;
		this.generation.set(path, g);
		return g;
	}

	private scheduleFlush(): void {
		this.io.scheduler.schedule(() => this.emit());
	}

	private emit(): void {
		if (this.listeners.size === 0) return;
		const snap = this.snapshot();
		for (const fn of this.listeners) fn(snap);
	}

	async start(): Promise<void> {
		if (this.running) return;
		this.running = true;
		const epoch = ++this.epoch;
		this.state = 'indexing';
		this.emit();
		try {
			const paths = this.io.listMarkdownPaths();
			for (let i = 0; i < paths.length && this.epoch === epoch; i += SCAN_CHUNK) {
				const chunk = paths.slice(i, i + SCAN_CHUNK);
				await Promise.all(chunk.map((p) => this.scanOne(p, epoch)));
			}
		} catch (e) {
			console.warn('[wayfinder] task index scan failed', e);
		}
		if (this.epoch === epoch) {
			this.state = 'ready';
			this.emit();
		}
	}

	private async scanOne(path: string, epoch: number): Promise<void> {
		const gen = this.bump(path);
		try {
			const content = await this.io.readFile(path);
			if (this.epoch !== epoch || this.generation.get(path) !== gen) return;
			const tasks = extractTasks(content);
			if (tasks.length > 0) this.entries.set(path, tasks);
			else this.entries.delete(path);
		} catch (e) {
			if (this.epoch !== epoch || this.generation.get(path) !== gen) return;
			if (!this.io.fileExists(path)) this.entries.delete(path);
			else console.warn('[wayfinder] task index read failed', path, e);
		}
	}

	stop(): void {
		if (!this.running) return;
		this.running = false;
		this.epoch++;
		this.io.scheduler.cancel();
		this.entries.clear();
		this.generation.clear();
		this.state = 'idle';
		this.emit();
	}

	async updateFile(path: string): Promise<void> {
		if (!this.running) return;
		const epoch = this.epoch;
		const gen = this.bump(path);
		try {
			const content = await this.io.readFile(path);
			if (this.epoch !== epoch || this.generation.get(path) !== gen) return;
			const tasks = extractTasks(content);
			if (tasks.length > 0) this.entries.set(path, tasks);
			else this.entries.delete(path);
			this.scheduleFlush();
		} catch (e) {
			if (this.epoch !== epoch || this.generation.get(path) !== gen) return;
			if (!this.io.fileExists(path)) {
				this.entries.delete(path);
				this.scheduleFlush();
			} else {
				console.warn('[wayfinder] task index read failed', path, e);
			}
		}
	}

	removeFile(path: string): void {
		if (!this.running) return;
		this.bump(path);
		this.entries.delete(path);
		this.scheduleFlush();
	}

	async renameFile(oldPath: string, newPath: string): Promise<void> {
		if (!this.running) return;
		this.bump(oldPath);
		this.bump(newPath);
		const existing = this.entries.get(oldPath);
		if (existing) {
			this.entries.delete(oldPath);
			this.entries.set(newPath, existing);
			this.scheduleFlush();
		} else {
			await this.updateFile(newPath); // updateFile owns the notification
		}
	}

	patchTaskStatus(path: string, task: ExtractedTask, newChar: string): void {
		if (!this.running || newChar.length !== 1) return;
		const list = this.entries.get(path);
		if (!list) return;
		const idx = list.findIndex((t) => t.line === task.line && t.raw === task.raw);
		if (idx < 0) return;
		const span = findStatusSpan(task.raw);
		if (!span) return;
		const newRaw = task.raw.slice(0, span.start) + newChar + task.raw.slice(span.end);
		const updated: ExtractedTask = {
			...list[idx]!,
			statusChar: newChar,
			status: statusFromChar(newChar),
			raw: newRaw,
		};
		const next = list.slice();
		next[idx] = updated;
		this.entries.set(path, next);
		this.bump(path);
		this.scheduleFlush();
	}
}
