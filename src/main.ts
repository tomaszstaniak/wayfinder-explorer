import { Notice, Plugin, TFile, TFolder, getIcon, getIconIds } from 'obsidian';
import { FolderCounts, HostData } from './compiler';
import { Controller } from './controller';
import { FRONTMATTER_ICONS, IconResolver, IconSource } from './icons';
import { addWayfinderMenu } from './menus';
import { detectParaRoots, paraAssignments } from './para';
import { ParaPresetModal } from './para-modal';
import { WayfinderSettingTab } from './settings';
import { Store } from './store';
import { StyleManager } from './style-manager';

export default class WayfinderPlugin extends Plugin {
	private styleManager!: StyleManager;
	store!: Store;
	iconSource!: IconSource;
	controller!: Controller;
	/** path -> icon candidates, from frontmatter detection. */
	private contentIcons = new Map<string, readonly string[]>();
	/** Paths of zero-byte notes. */
	private emptyFiles = new Set<string>();
	/** Path of the note currently being edited, and its linger timer. */
	private editingPath: string | null = null;
	private editingTimer: number | null = null;

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

		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				this.controller.handleRename(oldPath, file.path);
				if (this.contentIcons.delete(oldPath)) this.updateContentIcons(file);
				if (this.emptyFiles.delete(oldPath)) {
					this.emptyFiles.add(file.path);
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
				this.countsChanged();
			})
		);
		this.registerEvent(
			this.app.vault.on('create', (file) => {
				this.updateEmptyFile(file);
				this.countsChanged();
			})
		);
		this.registerEvent(this.app.vault.on('modify', (file) => this.updateEmptyFile(file)));
		this.registerEvent(
			this.app.workspace.on('editor-change', () => {
				if (this.store.state.settings.editingIndicator) this.onEditorActivity();
			})
		);
		this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.clearEditing()));
		this.registerEvent(
			this.app.metadataCache.on('changed', (file) => this.updateContentIcons(file))
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
		this.styleManager.unmount();
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
