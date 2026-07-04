import { Plugin } from 'obsidian';
import { StyleManager } from './style-manager';

export default class WayfinderPlugin extends Plugin {
	private styleManager!: StyleManager;

	onload() {
		this.styleManager = new StyleManager(document);
		this.styleManager.mount();
		// Phase 4 wires: state load -> compile -> styleManager.setCss(...)
	}

	onunload() {
		this.styleManager.unmount();
	}
}
