import { App, PluginSettingTab, Setting } from 'obsidian';
import { Store } from './store';
import { DEFAULT_SETTINGS, SETTINGS_BOUNDS } from './types';
import type WayfinderPlugin from './main';

export class WayfinderSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly wayfinder: WayfinderPlugin,
		private readonly store: Store
	) {
		super(app, wayfinder);
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
			.setName('Apply folder colors as')
			.setDesc('Background: a soft wash behind the folder’s contents. Text: the contents’ names take the color instead.')
			.addDropdown((d) =>
				d
					.addOption('background', 'Background wash')
					.addOption('text', 'Text color')
					.setValue(s.colorMode)
					.onChange((v) =>
						this.store.updateSettings({ colorMode: v === 'text' ? 'text' : 'background' })
					)
			);

		new Setting(containerEl)
			.setName('Subfolder colors')
			.setDesc('How subfolders of a colored folder get their colors. Same: inherit unchanged. Shades: same hue, varied lightness. Analogous: neighboring hues. Spread: maximally distinct hues. Override per folder via right-click → Wayfinder.')
			.addDropdown((d) =>
				d
					.addOption('same', 'Same color')
					.addOption('shades', 'Shades')
					.addOption('analogous', 'Analogous hues')
					.addOption('spread', 'Color spread')
					.setValue(s.childColorScheme)
					.onChange((v) =>
						this.store.updateSettings({
							childColorScheme:
								v === 'shades' || v === 'analogous' || v === 'spread' ? v : 'same',
						})
					)
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
			.setDesc('Show a count on each folder, right-aligned in monospace.')
			.addToggle((t) =>
				t.setValue(s.showFolderCounts).onChange((v) => {
					this.store.updateSettings({ showFolderCounts: v });
					this.display();
				})
			);

		if (s.showFolderCounts) {
			new Setting(containerEl)
				.setName('Count mode')
				.setDesc('Items: files and folders directly inside. Notes: notes anywhere in the subtree.')
				.addDropdown((d) =>
					d
						.addOption('items', 'Items inside')
						.addOption('notes', 'Notes in subtree')
						.setValue(s.folderCountMode)
						.onChange((v) =>
							this.store.updateSettings({ folderCountMode: v === 'notes' ? 'notes' : 'items' })
						)
				);
		}

		new Setting(containerEl).setName('Presets').setHeading();

		new Setting(containerEl)
			.setName('PARA preset')
			.setDesc(
				'Detect PARA root folders (Inbox, Projects, Areas, Resources, Archive — numbered or not) and apply colors along the actionability gradient, icons, archive dimming, and an inbox count badge. Shows a preview before changing anything; every assignment stays editable per folder afterwards.'
			)
			.addButton((b) =>
				b.setButtonText('Detect and apply…').onClick(() => this.wayfinder.openParaPreset())
			);

		new Setting(containerEl).setName('Appearance').setHeading();

		new Setting(containerEl)
			.setName('Show indent guides')
			.setDesc('Display the theme’s indent guide lines for nested folders. Colored main lines always show.')
			.addToggle((t) =>
				t
					.setValue(s.showIndentGuides)
					.onChange((v) => this.store.updateSettings({ showIndentGuides: v }))
			);

		if (s.showFolderCounts) {
			new Setting(containerEl)
				.setName('Show leaders')
				.setDesc('Display dots, dashes, or a line between item names and counts.')
				.addDropdown((d) =>
					d
						.addOption('none', 'None')
						.addOption('dots', 'Dots (…)')
						.addOption('dashes', 'Dashes (---)')
						.addOption('line', 'Line (—)')
						.setValue(s.leaderStyle)
						.onChange((v) =>
							this.store.updateSettings({
								leaderStyle: v === 'dots' || v === 'dashes' || v === 'line' ? v : 'none',
							})
						)
				);
		}

		new Setting(containerEl)
			.setName('Root item spacing')
			.setDesc('Extra spacing between root-level items (pixels).')
			.addSlider((sl) =>
				sl
					.setLimits(SETTINGS_BOUNDS.rootItemSpacing.min, SETTINGS_BOUNDS.rootItemSpacing.max, 1)
					.setValue(s.rootItemSpacing)
					.setDynamicTooltip()
					.onChange((v) => this.store.updateSettings({ rootItemSpacing: v }))
			);

		new Setting(containerEl)
			.setName('Tree indentation')
			.setDesc('Indentation width for nested folders (pixels). Zero uses the theme default (16px).')
			.addSlider((sl) =>
				sl
					.setLimits(0, SETTINGS_BOUNDS.treeIndent.max, 1)
					.setValue(s.treeIndent)
					.setDynamicTooltip()
					.onChange((v) => this.store.updateSettings({ treeIndent: v }))
			);

		new Setting(containerEl)
			.setName('Item height')
			.setDesc('Height of explorer rows (pixels). Zero uses the theme default.')
			.addSlider((sl) =>
				sl
					.setLimits(0, SETTINGS_BOUNDS.itemHeight.max, 1)
					.setValue(s.itemHeight)
					.setDynamicTooltip()
					.onChange((v) => {
						this.store.updateSettings({ itemHeight: v });
					})
			);

		new Setting(containerEl)
			.setName('Scale text with item height')
			.setDesc('Reduce text size when item height is below the standard height.')
			.addToggle((t) =>
				t
					.setValue(s.scaleTextWithHeight)
					.onChange((v) => this.store.updateSettings({ scaleTextWithHeight: v }))
			);

		new Setting(containerEl)
			.setName('Restore defaults')
			.setDesc('Reset the options above. Folder colors and manual icons are not touched.')
			.addButton((b) =>
				b.setButtonText('Restore').onClick(() => {
					this.store.updateSettings({ ...DEFAULT_SETTINGS });
					this.display();
				})
			);
	}
}
