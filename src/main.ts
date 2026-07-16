import {
	Editor,
	EventRef,
	Notice,
	Plugin,
	TFile,
	TFolder,
	debounce,
	getIcon,
	getIconIds,
} from 'obsidian';
import { FolderCounts, HostData } from './compiler';
import { Controller } from './controller';
import { FRONTMATTER_ICONS, IconResolver, IconSource } from './icons';
import { addWayfinderMenu } from './menus';
import { detectParaRoots, paraAssignments } from './para';
import { ParaPresetModal } from './para-modal';
import { WayfinderSettingTab } from './settings';
import { Store } from './store';
import { StyleManager } from './style-manager';
import { TaskModal } from './task-modal';
import { shorthandToTaskLine } from './task-parser';
import { countOpenTasksInText, rollUpToFolders } from './task-count';
import { TASKS_IN_NOTE_BLOCK, TASKS_DASHBOARD_BLOCK, blockInsertText } from './task-query';
import { TaskIndex, type TaskIndexIO } from './task-index';
import { VIEW_TYPE_GLOBAL_TASKS, WayfinderGlobalTasksView } from './task-global-view';

export default class WayfinderPlugin extends Plugin {
	private styleManager!: StyleManager;
	store!: Store;
	iconSource!: IconSource;
	controller!: Controller;
	/** path -> icon candidates, from frontmatter detection. */
	private contentIcons = new Map<string, readonly string[]>();
	/** Paths of zero-byte notes. */
	private emptyFiles = new Set<string>();
	/** Open-task count per note (only notes with >0), from file content. */
	private taskCountByFile = new Map<string, number>();
	/** Path of the note currently being edited, and its linger timer. */
	private editingPath: string | null = null;
	private editingTimer: number | null = null;
	/** Cross-vault task index (feeds the global tasks pane). */
	private taskIndex!: TaskIndex;
	private globalTaskRibbonEl: HTMLElement | null = null;
	private indexEventRefs: EventRef[] = [];
	private indexing = false;
	private pendingIndexFlush: (() => void) | null = null;

	async onload() {
		this.styleManager = new StyleManager(document);
		this.styleManager.mount();

		this.iconSource = {
			ids: () => getIconIds(),
			svg: (name) => getIcon(name),
		};
		const resolver = new IconResolver(this.iconSource);

		this.store = new Store({
			load: () => this.loadData() as Promise<unknown>,
			save: (data) => this.saveData(data),
		});

		this.controller = new Controller({
			store: this.store,
			resolve: resolver.resolve,
			hostData: () => this.hostData(),
			setCss: (css) => this.styleManager.setCss(css),
			warn: (msg) => console.warn(msg),
			notify: (msg) => new Notice(msg),
			schedule: (fn) => queueMicrotask(fn),
		});
		await this.controller.start();
		this.addSettingTab(new WayfinderSettingTab(this.app, this, this.store));

		// Retired in v0.5.1: the per-note Tasks sidebar is superseded by the global
		// pane's "This note" scope. Clean up any leaf restored from an old layout.
		this.app.workspace.onLayoutReady(() => this.app.workspace.detachLeavesOfType('wayfinder-tasks'));

		// Cross-vault task index: coalesce emits through a debounce, forwarding to
		// the index's latest flush (keeps the index Obsidian-agnostic).
		const indexFlush = debounce(() => this.taskIndexEmit(), 100, false);
		const io: TaskIndexIO = {
			listMarkdownPaths: () => this.app.vault.getMarkdownFiles().map((f) => f.path),
			readFile: (p) => {
				const f = this.app.vault.getAbstractFileByPath(p);
				return f instanceof TFile
					? this.app.vault.cachedRead(f)
					: Promise.reject(new Error('not a markdown file'));
			},
			fileExists: (p) => {
				const f = this.app.vault.getAbstractFileByPath(p);
				return f instanceof TFile && f.extension === 'md';
			},
			scheduler: {
				schedule: (fn) => {
					this.pendingIndexFlush = fn;
					indexFlush();
				},
				cancel: () => {
					this.pendingIndexFlush = null;
					indexFlush.cancel();
				},
			},
		};
		this.taskIndex = new TaskIndex(io);
		this.registerView(
			VIEW_TYPE_GLOBAL_TASKS,
			(leaf) => new WayfinderGlobalTasksView(leaf, this, this.taskIndex)
		);
		this.addCommand({
			id: 'open-global-tasks',
			name: 'Open global tasks (vault)',
			callback: () => void this.activateGlobalTasksView(),
		});

		// Defer to layout-ready so a leaf restored from the saved layout exists
		// before we decide to keep or detach it.
		this.app.workspace.onLayoutReady(() => this.syncGlobalTaskPane());

		// Rescan open-task counts when the feature is switched on.
		let taskCountsOn = this.store.state.settings.showTaskCounts;
		this.store.subscribe(() => {
			const on = this.store.state.settings.showTaskCounts;
			if (on !== taskCountsOn) {
				taskCountsOn = on;
				void this.scanTaskCounts();
			}
			this.syncGlobalTaskPane();
		});
		if (taskCountsOn) void this.scanTaskCounts();

		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				this.controller.handleRename(oldPath, file.path);
				if (this.contentIcons.delete(oldPath)) this.updateContentIcons(file);
				if (this.emptyFiles.delete(oldPath)) {
					this.emptyFiles.add(file.path);
					this.controller.requestRecompile();
				}
				if (this.taskCountByFile.has(oldPath)) {
					this.taskCountByFile.set(file.path, this.taskCountByFile.get(oldPath)!);
					this.taskCountByFile.delete(oldPath);
					this.controller.requestRecompile();
				}
				this.countsChanged();
			})
		);
		this.registerEvent(
			this.app.vault.on('delete', (file) => {
				this.controller.handleDelete(file.path);
				if (this.contentIcons.delete(file.path)) this.controller.requestRecompile();
				if (this.emptyFiles.delete(file.path)) this.controller.requestRecompile();
				if (this.taskCountByFile.delete(file.path)) this.controller.requestRecompile();
				this.countsChanged();
			})
		);
		this.registerEvent(
			this.app.vault.on('create', (file) => {
				this.updateEmptyFile(file);
				void this.updateFileTaskCount(file);
				this.countsChanged();
			})
		);
		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				this.updateEmptyFile(file);
				void this.updateFileTaskCount(file);
			})
		);
		this.registerEvent(
			this.app.workspace.on('editor-change', () => {
				if (this.store.state.settings.editingIndicator) this.onEditorActivity();
			})
		);
		this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.clearEditing()));
		this.registerEvent(
			this.app.metadataCache.on('changed', (file) => {
				this.updateContentIcons(file);
				void this.updateFileTaskCount(file);
			})
		);
		// Initial scan once all metadata is indexed (also fires on startup).
		this.registerEvent(
			this.app.metadataCache.on('resolved', () => {
				this.scanContentIcons();
				this.scanEmptyFiles();
			})
		);
		this.addCommand({
			id: 'apply-para-preset',
			name: 'Apply PARA preset to detected root folders',
			callback: () => this.openParaPreset(),
		});
		this.addCommand({
			id: 'quick-add-task',
			name: 'Quick add task (shorthand)',
			callback: () => this.openQuickTask(),
		});
		this.addCommand({
			id: 'convert-line-to-task',
			name: 'Convert line to task (shorthand)',
			editorCallback: (editor) => this.convertLinesToTasks(editor),
		});
		this.addCommand({
			id: 'insert-tasks-in-note',
			name: 'Insert tasks-in-note query block',
			editorCallback: (editor) => this.insertTasksBlock(editor, TASKS_IN_NOTE_BLOCK),
		});
		this.addCommand({
			id: 'insert-tasks-dashboard',
			name: 'Insert vault tasks dashboard block',
			editorCallback: (editor) => this.insertTasksBlock(editor, TASKS_DASHBOARD_BLOCK),
		});
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				addWayfinderMenu(menu, file, {
					app: this.app,
					store: this.store,
					iconSource: this.iconSource,
				});
			})
		);
	}

	onunload() {
		if (this.editingTimer !== null) window.clearTimeout(this.editingTimer);
		this.stopIndexing();
		this.styleManager.unmount();
	}

	/** Forward the index's coalesced flush (bound once via debounce) to its latest callback. */
	private taskIndexEmit(): void {
		const fn = this.pendingIndexFlush;
		this.pendingIndexFlush = null;
		if (fn) fn();
	}

	/** Single sync point for the global pane; runs even when disabled (detaches restored leaves). */
	syncGlobalTaskPane(): void {
		const on = this.store.state.settings.showGlobalTaskPane;
		if (on) {
			if (!this.globalTaskRibbonEl) {
				this.globalTaskRibbonEl = this.addRibbonIcon(
					'list-checks',
					'Wayfinder vault tasks',
					() => void this.activateGlobalTasksView()
				);
			}
			this.startIndexing();
		} else {
			if (this.globalTaskRibbonEl) {
				this.globalTaskRibbonEl.remove();
				this.globalTaskRibbonEl = null;
			}
			this.stopIndexing();
			this.app.workspace.detachLeavesOfType(VIEW_TYPE_GLOBAL_TASKS);
		}
	}

	private startIndexing(): void {
		if (this.indexing) return;
		this.indexing = true;
		const vault = this.app.vault;
		const isMd = (f: unknown): f is TFile => f instanceof TFile && f.extension === 'md';
		this.indexEventRefs = [
			vault.on('create', (f) => {
				if (isMd(f)) void this.taskIndex.updateFile(f.path);
			}),
			vault.on('modify', (f) => {
				if (isMd(f)) void this.taskIndex.updateFile(f.path);
			}),
			vault.on('delete', (f) => {
				if (isMd(f)) this.taskIndex.removeFile(f.path);
			}),
			vault.on('rename', (f, oldPath) => {
				const wasMd = oldPath.endsWith('.md');
				const isNowMd = isMd(f);
				if (wasMd && isNowMd) void this.taskIndex.renameFile(oldPath, f.path);
				else if (wasMd && !isNowMd) this.taskIndex.removeFile(oldPath);
				else if (!wasMd && isNowMd) void this.taskIndex.updateFile(f.path);
			}),
		];
		// Own the refs manually (offref in stopIndexing, reached via onunload too);
		// do NOT also registerEvent them, or dead refs accumulate across toggles.
		void this.taskIndex.start();
	}

	private stopIndexing(): void {
		if (!this.indexing) return;
		this.indexing = false;
		for (const ref of this.indexEventRefs) this.app.vault.offref(ref);
		this.indexEventRefs = [];
		this.taskIndex.stop();
	}

	async activateGlobalTasksView(): Promise<void> {
		if (!this.store.state.settings.showGlobalTaskPane) {
			new Notice('Enable the global tasks pane in Wayfinder settings first.');
			return;
		}
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(VIEW_TYPE_GLOBAL_TASKS)[0] ?? null;
		if (!leaf) {
			leaf = workspace.getRightLeaf(false);
			await leaf?.setViewState({ type: VIEW_TYPE_GLOBAL_TASKS, active: true });
		}
		if (leaf) await workspace.revealLeaf(leaf);
	}

	/** Debounce window after the last keystroke before the icon reverts. */
	private static readonly EDITING_LINGER_MS = 1500;

	private onEditorActivity(): void {
		const path = this.app.workspace.getActiveFile()?.path ?? null;
		if (path !== this.editingPath) {
			this.editingPath = path;
			this.controller.requestRecompile();
		}
		if (this.editingTimer !== null) window.clearTimeout(this.editingTimer);
		this.editingTimer = window.setTimeout(
			() => this.clearEditing(),
			WayfinderPlugin.EDITING_LINGER_MS
		);
	}

	private clearEditing(): void {
		if (this.editingTimer !== null) {
			window.clearTimeout(this.editingTimer);
			this.editingTimer = null;
		}
		if (this.editingPath !== null) {
			this.editingPath = null;
			this.controller.requestRecompile();
		}
	}

	/** Rewrite each non-empty line in the selection (or the cursor line) in place. */
	private convertLinesToTasks(editor: Editor): void {
		const now = new Date();
		const from = editor.getCursor('from').line;
		const to = editor.getCursor('to').line;
		for (let line = from; line <= to; line++) {
			const text = editor.getLine(line);
			const indent = /^\s*/.exec(text)?.[0] ?? '';
			const body = text.slice(indent.length);
			if (body === '') continue;
			const converted = shorthandToTaskLine(body, now);
			if (converted !== body) editor.setLine(line, indent + converted);
		}
	}

	openQuickTask(): void {
		new TaskModal(this.app, (line) => {
			const editor = this.app.workspace.activeEditor?.editor;
			if (editor) editor.replaceSelection(line + '\n');
			else new Notice('Wayfinder: open a note to insert the task.');
		}).open();
	}

	/** Insert a Tasks block at the cursor; warn if the Tasks plugin can't render it. */
	private insertTasksBlock(editor: Editor, block: string): void {
		const cursor = editor.getCursor();
		const before = editor.getLine(cursor.line).slice(0, cursor.ch);
		editor.replaceSelection(blockInsertText(block, before));
		if (!this.isTasksPluginEnabled()) {
			new Notice(
				'Wayfinder: inserted a Tasks block, but the Tasks plugin is disabled — it will not render until you enable it.'
			);
		}
	}

	/** Whether the community Tasks plugin is installed and enabled. */
	private isTasksPluginEnabled(): boolean {
		const plugins = (this.app as unknown as { plugins?: { enabledPlugins?: Set<string> } })
			.plugins;
		return plugins?.enabledPlugins?.has('obsidian-tasks-plugin') ?? false;
	}

	openParaPreset(): void {
		const roots = this.app.vault
			.getRoot()
			.children.filter((c): c is TFolder => c instanceof TFolder)
			.map((f) => f.path);
		const assignments = paraAssignments(detectParaRoots(roots));
		new ParaPresetModal(this.app, assignments, (confirmed) => {
			for (const a of confirmed) this.store.applyPresetEntry(a.path, a.entry);
			new Notice(`Wayfinder: PARA preset applied to ${confirmed.length} folder(s).`);
		}).open();
	}

	private needsCounts(): boolean {
		return (
			this.store.state.settings.showFolderCounts ||
			this.store.state.settings.showTaskCounts ||
			Object.values(this.store.state.folders).some((e) => e.countBadge)
		);
	}

	private hostData(): HostData {
		const host: HostData = {};
		if (this.needsCounts()) host.counts = this.folderCounts();
		if (this.contentIcons.size > 0) host.contentIcons = this.contentIcons;
		const needsPaths =
			this.store.state.settings.childColorScheme !== 'same' ||
			Object.values(this.store.state.folders).some((e) => e.childColors);
		if (needsPaths) {
			host.folderPaths = this.app.vault
				.getAllLoadedFiles()
				.filter((f): f is TFolder => f instanceof TFolder && f.path !== '/')
				.map((f) => f.path);
		}
		if (this.store.state.settings.emptyFileIcons && this.emptyFiles.size > 0) {
			host.emptyFiles = [...this.emptyFiles];
		}
		if (this.store.state.settings.editingIndicator && this.editingPath) {
			host.editingFile = this.editingPath;
		}
		if (this.store.state.settings.showTaskCounts) {
			host.taskCounts = this.openTaskCounts();
		}
		return host;
	}

	private isEmptyNote(file: unknown): file is TFile {
		return file instanceof TFile && file.extension === 'md' && file.stat.size === 0;
	}

	private updateEmptyFile(file: unknown): void {
		if (!(file instanceof TFile) || file.extension !== 'md') return;
		const empty = file.stat.size === 0;
		if (empty === this.emptyFiles.has(file.path)) return;
		if (empty) this.emptyFiles.add(file.path);
		else this.emptyFiles.delete(file.path);
		this.controller.requestRecompile();
	}

	private scanEmptyFiles(): void {
		const next = new Set<string>();
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (this.isEmptyNote(file)) next.add(file.path);
		}
		const changed =
			next.size !== this.emptyFiles.size || [...next].some((p) => !this.emptyFiles.has(p));
		this.emptyFiles = next;
		if (changed) this.controller.requestRecompile();
	}

	/** Counts per folder: direct children, or notes in the whole subtree. */
	private folderCounts(): FolderCounts {
		const notesMode = this.store.state.settings.folderCountMode === 'notes';
		const counts = new Map<string, number>();
		const walk = (folder: TFolder): number => {
			let notes = 0;
			for (const child of folder.children) {
				if (child instanceof TFolder) notes += walk(child);
				else if (child instanceof TFile && child.extension === 'md') notes += 1;
			}
			if (folder.path !== '/') {
				counts.set(folder.path, notesMode ? notes : folder.children.length);
			}
			return notes;
		};
		walk(this.app.vault.getRoot());
		return counts;
	}

	/** Open tasks per folder subtree, rolled up from the per-file cache. */
	private openTaskCounts(): FolderCounts {
		const excluded = Object.entries(this.store.state.folders)
			.filter(([, entry]) => entry.excludeTaskCount)
			.map(([path]) => path);
		return rollUpToFolders(this.taskCountByFile, excluded);
	}

	/** Re-read one note and update its open-task count. */
	private async updateFileTaskCount(file: unknown): Promise<void> {
		if (!(file instanceof TFile) || file.extension !== 'md') return;
		if (!this.store.state.settings.showTaskCounts) return;
		const n = countOpenTasksInText(await this.app.vault.cachedRead(file));
		const had = this.taskCountByFile.get(file.path) ?? 0;
		if (n === had) return;
		if (n > 0) this.taskCountByFile.set(file.path, n);
		else this.taskCountByFile.delete(file.path);
		this.controller.requestRecompile();
	}

	/** Full rescan of open-task counts (on enable / startup). */
	async scanTaskCounts(): Promise<void> {
		if (!this.store.state.settings.showTaskCounts) {
			if (this.taskCountByFile.size > 0) {
				this.taskCountByFile = new Map();
				this.controller.requestRecompile();
			}
			return;
		}
		const next = new Map<string, number>();
		for (const file of this.app.vault.getMarkdownFiles()) {
			const n = countOpenTasksInText(await this.app.vault.cachedRead(file));
			if (n > 0) next.set(file.path, n);
		}
		this.taskCountByFile = next;
		this.controller.requestRecompile();
	}

	private countsChanged(): void {
		if (this.needsCounts()) this.controller.requestRecompile();
	}

	/** Frontmatter keys that mark special content types (Kanban, …). */
	private detectContentIcons(file: TFile): readonly string[] | null {
		if (file.extension !== 'md') return null;
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
		if (!fm) return null;
		for (const entry of FRONTMATTER_ICONS) {
			if (entry.key in fm) return entry.icons;
		}
		return null;
	}

	private updateContentIcons(file: unknown): void {
		if (!(file instanceof TFile)) return;
		const icons = this.detectContentIcons(file);
		const had = this.contentIcons.get(file.path);
		if (icons === null ? had === undefined : had === icons) return;
		if (icons === null) this.contentIcons.delete(file.path);
		else this.contentIcons.set(file.path, icons);
		this.controller.requestRecompile();
	}

	private scanContentIcons(): void {
		const next = new Map<string, readonly string[]>();
		for (const file of this.app.vault.getMarkdownFiles()) {
			const icons = this.detectContentIcons(file);
			if (icons) next.set(file.path, icons);
		}
		const changed =
			next.size !== this.contentIcons.size ||
			[...next.keys()].some((k) => !this.contentIcons.has(k));
		this.contentIcons = next;
		if (changed) this.controller.requestRecompile();
	}
}
