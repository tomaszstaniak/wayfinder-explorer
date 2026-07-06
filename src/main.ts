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
				this.countsChanged();
			})
		);
		this.registerEvent(
			this.app.vault.on('delete', (file) => {
				this.controller.handleDelete(file.path);
				if (this.contentIcons.delete(file.path)) this.controller.requestRecompile();
				this.countsChanged();
			})
		);
		this.registerEvent(this.app.vault.on('create', () => this.countsChanged()));
		this.registerEvent(
			this.app.metadataCache.on('changed', (file) => this.updateContentIcons(file))
		);
		// Initial scan once all metadata is indexed (also fires on startup).
		this.registerEvent(this.app.metadataCache.on('resolved', () => this.scanContentIcons()));
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
		this.styleManager.unmount();
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
		return host;
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
