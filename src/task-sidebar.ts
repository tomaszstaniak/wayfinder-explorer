import { ItemView, MarkdownView, Notice, TFile, WorkspaceLeaf, debounce } from 'obsidian';
import type WayfinderPlugin from './main';
import type { ExtractedTask } from './task-extract';
import { extractTasks } from './task-extract';
import { toggleTaskStatus, type ToggleEnv } from './task-actions';
import { renderTaskList } from './task-view';
import { markdownViewForPath, openTaskLocation } from './task-obsidian';

export const VIEW_TYPE_TASKS = 'wayfinder-tasks';

export class WayfinderTasksView extends ItemView {
	private listEl!: HTMLElement;
	private refreshSeq = 0;
	private readonly debouncedRefresh = debounce(() => void this.refresh(), 150, false);

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: WayfinderPlugin
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_TASKS;
	}
	getDisplayText(): string {
		return 'Tasks in note';
	}
	getIcon(): string {
		return 'list-checks';
	}

	async onOpen(): Promise<void> {
		this.contentEl.addClass('wayfinder-tasks-pane');
		this.listEl = this.contentEl.createDiv({ cls: 'wayfinder-task-list' });

		const ws = this.plugin.app.workspace;
		this.registerEvent(ws.on('active-leaf-change', () => this.debouncedRefresh()));
		this.registerEvent(ws.on('file-open', () => this.debouncedRefresh()));
		this.registerEvent(ws.on('editor-change', () => this.debouncedRefresh()));
		this.registerEvent(this.plugin.app.metadataCache.on('changed', () => this.debouncedRefresh()));
		this.registerEvent(this.plugin.app.vault.on('modify', () => this.debouncedRefresh()));

		await this.refresh();
	}

	/** Re-read the active note and re-render its tasks (stale reads discarded). */
	async refresh(): Promise<void> {
		const seq = ++this.refreshSeq;
		const { file, text } = await this.activeSource();
		// Discard if a newer refresh started, or the pane closed mid-read.
		if (seq !== this.refreshSeq || !this.listEl.isConnected) return;

		if (!file) return this.renderEmpty('No note open.');
		const tasks = extractTasks(text);
		if (tasks.length === 0) return this.renderEmpty('No tasks in this note.');
		renderTaskList(this.listEl, tasks, {
			onToggle: (t) => void this.toggle(file, t),
			onJump: (t) => void this.jump(file, t.line),
		});
	}

	private renderEmpty(message: string): void {
		this.listEl.empty();
		this.listEl.createDiv({ cls: 'wayfinder-task-empty', text: message });
	}

	/** Prefer the live editor buffer for THIS file (found by path), else read disk. */
	private async activeSource(): Promise<{ file: TFile | null; text: string }> {
		const ws = this.plugin.app.workspace;
		// Only Markdown notes; never cachedRead an arbitrary (e.g. binary) file.
		const candidate = ws.getActiveViewOfType(MarkdownView)?.file ?? ws.getActiveFile();
		const file = candidate?.extension === 'md' ? candidate : null;
		if (!file) return { file: null, text: '' };
		const view = markdownViewForPath(this.plugin.app, file.path);
		if (view) return { file, text: view.editor.getValue() };
		return { file, text: await this.plugin.app.vault.cachedRead(file) };
	}

	private async toggle(file: TFile, task: ExtractedTask): Promise<void> {
		const editor = markdownViewForPath(this.plugin.app, file.path)?.editor ?? null;
		const env: ToggleEnv = {
			editor: editor
				? {
						getLine: (line) =>
							line >= 0 && line < editor.lineCount() ? editor.getLine(line) : null,
						replaceRange: (line, s, e, text) =>
							editor.replaceRange(text, { line, ch: s }, { line, ch: e }),
					}
				: null,
			disk: {
				process: async (transform) => {
					// Sentinel abort: throwing before returning means vault.process
					// never writes, so a mismatch bumps no mtime.
					const abort = new Error('wayfinder-task-abort');
					try {
						await this.plugin.app.vault.process(file, (content) => {
							const next = transform(content);
							if (next === null) throw abort;
							return next;
						});
						return 'wrote';
					} catch (error) {
						if (error === abort) return 'aborted';
						throw error instanceof Error ? error : new Error(String(error));
					}
				},
			},
			notify: (m) => new Notice(m),
		};
		await toggleTaskStatus(env, task);
		await this.refresh();
	}

	/** Open/reveal the note in a Markdown leaf — never the sidebar pane. */
	private async jump(file: TFile, line: number): Promise<void> {
		await openTaskLocation(this.plugin.app, file, line);
	}
}
