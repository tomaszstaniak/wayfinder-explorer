import { App, PluginSettingTab, Setting } from 'obsidian';
import { Store } from './store';
import { DEFAULT_SETTINGS, SETTINGS_BOUNDS } from './types';
import type WayfinderPlugin from './main';

export class WayfinderSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		plugin: WayfinderPlugin,
		private readonly store: Store
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const s = this.store.state.settings;

		new Setting(containerEl)
			.setName('Default file icons')
			.setDesc('Show a contextual icon for every file, based on its type (note, PDF, image, …). Manual icons always show.')
			.addToggle((t) =>
				t.setValue(s.defaultFileIcons).onChange((v) => this.store.updateSettings({ defaultFileIcons: v }))
			);

		new Setting(containerEl)
			.setName('Default folder icons')
			.setDesc('Show a folder icon on every folder. Manual icons always show.')
			.addToggle((t) =>
				t
					.setValue(s.defaultFolderIcons)
					.onChange((v) => this.store.updateSettings({ defaultFolderIcons: v }))
			);

		new Setting(containerEl)
			.setName('Background tint strength')
			.setDesc('How strongly a folder color washes over its contents (percent). Zero keeps the colored name and line without a background.')
			.addSlider((sl) =>
				sl
					.setLimits(SETTINGS_BOUNDS.tintStrength.min, SETTINGS_BOUNDS.tintStrength.max, 1)
					.setValue(s.tintStrength)
					.setDynamicTooltip()
					.onChange((v) => this.store.updateSettings({ tintStrength: v }))
			);

		new Setting(containerEl)
			.setName('Main line width')
			.setDesc('Width of the colored vertical line marking a colored folder’s contents (pixels).')
			.addSlider((sl) =>
				sl
					.setLimits(SETTINGS_BOUNDS.lineWidth.min, SETTINGS_BOUNDS.lineWidth.max, 1)
					.setValue(s.lineWidth)
					.setDynamicTooltip()
					.onChange((v) => this.store.updateSettings({ lineWidth: v }))
			);

		new Setting(containerEl)
			.setName('Folder item counts')
			.setDesc('Show how many items sit directly inside each folder, right-aligned in monospace.')
			.addToggle((t) =>
				t
					.setValue(s.showFolderCounts)
					.onChange((v) => this.store.updateSettings({ showFolderCounts: v }))
			);

		new Setting(containerEl)
			.setName('Restore defaults')
			.setDesc('Reset the four options above. Folder colors and manual icons are not touched.')
			.addButton((b) =>
				b.setButtonText('Restore').onClick(() => {
					this.store.updateSettings({ ...DEFAULT_SETTINGS });
					this.display();
				})
			);
	}
}
