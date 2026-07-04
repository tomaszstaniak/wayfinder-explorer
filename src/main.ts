import { Notice, Plugin, getIcon, getIconIds } from 'obsidian';
import { Controller } from './controller';
import { IconResolver, IconSource } from './icons';
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
			setCss: (css) => this.styleManager.setCss(css),
			warn: (msg) => console.warn(msg),
			notify: (msg) => new Notice(msg),
			schedule: (fn) => queueMicrotask(fn),
		});
		await this.controller.start();

		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				this.controller.handleRename(oldPath, file.path);
			})
		);
		this.registerEvent(
			this.app.vault.on('delete', (file) => {
				this.controller.handleDelete(file.path);
			})
		);
	}

	onunload() {
		this.styleManager.unmount();
	}
}
