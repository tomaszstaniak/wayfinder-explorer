import { Notice, Plugin, TFolder, getIcon, getIconIds } from 'obsidian';
import { FolderCounts } from './compiler';
import { Controller } from './controller';
import { IconResolver, IconSource } from './icons';
import { addWayfinderMenu } from './menus';
import { WayfinderSettingTab } from './settings';
import { Store } from './store';
import { StyleManager } from './style-manager';

export default class WayfinderPlugin extends Plugin {
	private styleManager!: StyleManager;
	store!: Store;
	iconSource!: IconSource;
	controller!: Controller;

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
			counts: () => (this.store.state.settings.showFolderCounts ? this.folderCounts() : null),
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
				this.countsChanged();
			})
		);
		this.registerEvent(
			this.app.vault.on('delete', (file) => {
				this.controller.handleDelete(file.path);
				this.countsChanged();
			})
		);
		this.registerEvent(this.app.vault.on('create', () => this.countsChanged()));
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

	/** Direct child counts for every folder in the vault. */
	private folderCounts(): FolderCounts {
		const counts = new Map<string, number>();
		const walk = (folder: TFolder) => {
			if (folder.path !== '/') counts.set(folder.path, folder.children.length);
			for (const child of folder.children) {
				if (child instanceof TFolder) walk(child);
			}
		};
		walk(this.app.vault.getRoot());
		return counts;
	}

	private countsChanged(): void {
		if (this.store.state.settings.showFolderCounts) this.controller.requestRecompile();
	}
}
