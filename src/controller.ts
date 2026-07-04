import { IconUriResolver, compile } from './compiler';
import { Store } from './store';

export interface ControllerDeps {
	store: Store;
	resolve: IconUriResolver;
	/** Push compiled CSS into the managed style element. */
	setCss(css: string): void;
	/** Developer-facing warning channel (console). Deduplicated here. */
	warn(msg: string): void;
	/** User-facing notice channel (Obsidian Notice). */
	notify(msg: string): void;
	/** Recompile scheduler; production uses queueMicrotask. */
	schedule(fn: () => void): void;
}

/**
 * Wires store changes to compilation. Owns coalescing and warning
 * deduplication; knows nothing about Obsidian's API surface.
 */
export class Controller {
	private pending = false;
	private warned = new Set<string>();

	constructor(private readonly deps: ControllerDeps) {}

	async start(): Promise<void> {
		const store = this.deps.store;
		store.onSaveError = () =>
			this.deps.notify(
				'Wayfinder: saving settings failed. Changes are kept in memory; the next change retries.'
			);
		await store.load();
		for (const w of store.loadWarnings) this.warnOnce(w);
		if (store.loadWarnings.length > 0) {
			this.deps.notify('Wayfinder: some stored data was invalid and was skipped. See console.');
		}
		store.subscribe(() => this.scheduleRecompile());
		this.recompileNow();
	}

	handleRename(oldPath: string, newPath: string): void {
		this.deps.store.handleRename(oldPath, newPath);
	}

	handleDelete(path: string): void {
		this.deps.store.handleDelete(path);
	}

	/** Coalesces bursts: many store changes in one tick compile once. */
	private scheduleRecompile(): void {
		if (this.pending) return;
		this.pending = true;
		this.deps.schedule(() => {
			this.pending = false;
			this.recompileNow();
		});
	}

	recompileNow(): void {
		const { css, missingIcons } = compile(this.deps.store.state, this.deps.resolve);
		for (const name of missingIcons) {
			this.warnOnce(`Wayfinder: icon "${name}" is not available; rule skipped.`);
		}
		this.deps.setCss(css);
	}

	private warnOnce(msg: string): void {
		if (this.warned.has(msg)) return;
		this.warned.add(msg);
		this.deps.warn(msg);
	}
}
