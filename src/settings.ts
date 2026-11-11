import { App, EventRef, PluginSettingTab, Setting, setIcon } from 'obsidian';
import { ColorPickerModal } from './color-picker';
import { FolderSuggestModal } from './folder-suggest';
import { IconPickerModal } from './icon-picker';
import { SignalRuleModal } from './signal-rule-modal';
import { Store } from './store';
import { DEFAULT_SETTINGS, SETTINGS_BOUNDS, SignalRule } from './types';
import type WayfinderPlugin from './main';
import { filterSettings } from './settings-search';

export class WayfinderSettingTab extends PluginSettingTab {
	/** One-shot listener that re-renders once frontmatter suggestions are ready. */
	private resolvedRef: EventRef | null = null;
	private searchQuery = '';

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

		const search = new Setting(containerEl)
			.setName('Search settings')
			.setDesc('Filter by section, setting name, or description.')
			.addSearch((input) =>
				input
					.setPlaceholder('Search wayfinder settings…')
					.setValue(this.searchQuery)
					.onChange((value) => {
						this.searchQuery = value;
						filterSettings(containerEl, value);
					})
			);
		search.settingEl.addClass('wayfinder-settings-search');

		new Setting(containerEl)
			.setName('Default file icons')
			.setDesc('Show a contextual icon for every file, based on its type (note, PDF, image, …). Manual icons always show.')
			.addToggle((t) =>
				t.setValue(s.defaultFileIcons).onChange((v) => {
					this.store.updateSettings({ defaultFileIcons: v });
					this.display();
				})
			);

		if (s.defaultFileIcons) {
			new Setting(containerEl)
				.setName('Empty note icons')
				.setDesc('Show a blank-sheet icon for notes without content, so unfilled notes stand out.')
				.addToggle((t) =>
					t
						.setValue(s.emptyFileIcons)
						.onChange((v) => this.store.updateSettings({ emptyFileIcons: v }))
				);
		}

		new Setting(containerEl)
			.setName('Editing indicator')
			.setDesc('While you are typing in a note, swap its icon to mark it as being edited; it reverts shortly after you stop.')
			.addToggle((t) =>
				t.setValue(s.editingIndicator).onChange((v) => {
					this.store.updateSettings({ editingIndicator: v });
					this.display();
				})
			);

		if (s.editingIndicator) {
			new Setting(containerEl)
				.setName('Editing icon')
				.setDesc(`Currently: ${s.editingIcon}.`)
				.addButton((b) =>
					b.setButtonText('Choose…').onClick(() => {
						new IconPickerModal(this.app, this.wayfinder.iconSource.ids(), (iconId) => {
							this.store.updateSettings({ editingIcon: iconId });
							this.display();
						}).open();
					})
				)
				.addButton((b) =>
					b.setButtonText('Reset').onClick(() => {
						this.store.updateSettings({ editingIcon: DEFAULT_SETTINGS.editingIcon });
						this.display();
					})
				);

			new Setting(containerEl)
				.setName('Blink on edit')
				.setDesc('Pulse the note’s row once in its folder color when you start editing. Needs the note to sit under a colored folder.')
				.addToggle((t) =>
					t
						.setValue(s.editingBlink)
						.onChange((v) => this.store.updateSettings({ editingBlink: v }))
				);
		}

		new Setting(containerEl)
			.setName('Icon color')
			.setDesc('Follow text: icons match the item’s text color. Follow folder color: icons take their folder scope’s color. A per-item icon color (right-click → Wayfinder) always wins.')
			.addDropdown((d) =>
				d
					.addOption('text', 'Follow text color')
					.addOption('folder', 'Follow folder color')
					.setValue(s.iconColorSource)
					.onChange((v) =>
						this.store.updateSettings({ iconColorSource: v === 'folder' ? 'folder' : 'text' })
					)
			);

		new Setting(containerEl)
			.setName('Default folder icons')
			.setDesc('Show a folder icon on every folder. Manual icons always show.')
			.addToggle((t) =>
				t.setValue(s.defaultFolderIcons).onChange((v) => {
					this.store.updateSettings({ defaultFolderIcons: v });
					this.display();
				})
			);

		if (s.defaultFolderIcons) {
			new Setting(containerEl)
				.setName('Default folder icon')
				.setDesc(`Currently: ${s.defaultFolderIcon}. Override per subtree via right-click → Wayfinder → Subfolder icon.`)
				.addButton((b) =>
					b.setButtonText('Choose…').onClick(() => {
						new IconPickerModal(this.app, this.wayfinder.iconSource.ids(), (iconId) => {
							this.store.updateSettings({ defaultFolderIcon: iconId });
							this.display();
						}).open();
					})
				)
				.addButton((b) =>
					b.setButtonText('Reset').onClick(() => {
						this.store.updateSettings({ defaultFolderIcon: DEFAULT_SETTINGS.defaultFolderIcon });
						this.display();
					})
				);
		}

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

		this.displayFolderRules(containerEl);
		this.displaySignalRules(containerEl);

		new Setting(containerEl).setName('Tasks').setHeading();

		new Setting(containerEl)
			.setName('Show open-task counts')
			.setDesc('Add an accent pill to each folder showing its number of unfinished tasks (todo and in-progress) anywhere inside it — shown in addition to the item count.')
			.addToggle((t) =>
				t
					.setValue(s.showTaskCounts)
					.onChange((v) => this.store.updateSettings({ showTaskCounts: v }))
			);

		new Setting(containerEl)
			.setName('Global tasks pane')
			.setDesc(
				'Show a vault-wide pane of all tasks, grouped and filterable, with a ribbon icon to open it.'
			)
			.addToggle((t) =>
				t
					.setValue(s.showGlobalTaskPane)
					.onChange((v) => this.store.updateSettings({ showGlobalTaskPane: v }))
			);

		new Setting(containerEl)
			.setName('Quick add task')
			.setDesc(
				'One-line capture that compiles to a Tasks-plugin line: @date (today, friday, 3d, 2026-07-15), !priority (high, !!!, 2), *recurrence (weekly). Also accepts an existing "- [ ]" line to augment it. Or write the shorthand directly in a note and run "Convert line to task (shorthand)" (bind either command to a hotkey).'
			)
			.addButton((b) => b.setButtonText('Add task…').onClick(() => this.wayfinder.openQuickTask()));

		new Setting(containerEl).setName('Presets').setHeading();

		new Setting(containerEl)
			.setName('PARA preset')
			.setDesc(
				'Detect PARA root folders (Inbox, Projects, Areas, Resources, Archive — numbered or not) and apply colors along the actionability gradient, icons, archive dimming, and an inbox count badge. Shows a preview before changing anything; every assignment stays editable per folder afterwards.'
			)
			.addButton((b) =>
				b.setButtonText('Detect and apply…').onClick(() => this.wayfinder.openParaPreset())
			);

		new Setting(containerEl).setName('Navigation').setHeading();

		new Setting(containerEl)
			.setName('Active file position')
			.setDesc(
				'Choose where the active file appears after Obsidian reveals it in the file explorer.'
			)
			.addDropdown((d) =>
				d
					.addOption('native', 'Native (nearest edge)')
					.addOption('center', 'Center instantly')
					.addOption('center-smooth', 'Center smoothly')
					.setValue(s.activeFileRevealMode)
					.onChange((v) =>
						this.store.updateSettings({
							activeFileRevealMode:
								v === 'center' || v === 'center-smooth' ? v : 'native',
						})
					)
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
			.setDesc('Reset the options above. Folder rules are not touched.')
			.addButton((b) =>
				b.setButtonText('Restore').onClick(() => {
					this.store.updateSettings({ ...DEFAULT_SETTINGS });
					this.display();
				})
			);

		const empty = containerEl.createDiv({
			cls: 'wayfinder-settings-empty',
			text: 'No Wayfinder settings match your search.',
		});
		empty.hidden = true;
		filterSettings(containerEl, this.searchQuery);

		// Re-render once metadata resolves so signal suggestions appear (one-shot).
		if (!this.wayfinder.isMetadataReady() && !this.resolvedRef) {
			this.resolvedRef = this.app.metadataCache.on('resolved', () => {
				if (this.resolvedRef) {
					this.app.metadataCache.offref(this.resolvedRef);
					this.resolvedRef = null;
				}
				this.display();
			});
		}
	}

	hide(): void {
		if (this.resolvedRef) {
			this.app.metadataCache.offref(this.resolvedRef);
			this.resolvedRef = null;
		}
		super.hide();
	}

	/** Everything Wayfinder is doing per folder, editable in one place. */
	private displayFolderRules(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('Folder rules').setHeading();

		const entries = Object.entries(this.store.state.folders).sort(([a], [b]) =>
			a.localeCompare(b)
		);

		new Setting(containerEl)
			.setName('Add folder rule')
			.setDesc(
				entries.length === 0
					? 'No folder rules yet. Add one here, use the PARA preset below, or right-click a folder in the explorer.'
					: 'Rules can also be edited by right-clicking a folder in the explorer.'
			)
			.addButton((b) =>
				b.setButtonText('Add folder…').onClick(() => {
					new FolderSuggestModal(this.app, (folder) => {
						new ColorPickerModal(this.app, null, (color) => {
							this.store.setFolderColor(folder.path, color);
							this.display();
						}).open();
					}).open();
				})
			);

		for (const [path, entry] of entries) {
			const parts: string[] = [];
			if (entry.color === null) parts.push('no color (opt-out)');
			else if (entry.color) parts.push(`color ${entry.color}`);
			if (entry.icon) parts.push(`icon ${entry.icon}`);
			if (entry.childIcon) parts.push(`subfolder icon ${entry.childIcon}`);
			if (entry.iconColor) parts.push(`icon color ${entry.iconColor}`);
			if (entry.childColors) parts.push(`subfolders ${entry.childColors}`);
			if (entry.emphasis) parts.push(entry.emphasis === 'dim' ? 'dimmed' : 'keep normal');
			if (entry.countBadge) parts.push('count badge');

			const row = new Setting(containerEl).setName(path).setDesc(parts.join(' · '));
			if (typeof entry.color === 'string') row.nameEl.style.color = entry.color;

			row
				.addExtraButton((b) =>
					b
						.setIcon('palette')
						.setTooltip('Color')
						.onClick(() => {
							new ColorPickerModal(this.app, entry.color ?? null, (color) => {
								this.store.setFolderColor(path, color);
								this.display();
							}).open();
						})
				)
				.addExtraButton((b) =>
					b
						.setIcon('image-plus')
						.setTooltip('Icon')
						.onClick(() => {
							new IconPickerModal(this.app, this.wayfinder.iconSource.ids(), (iconId) => {
								this.store.setFolderIcon(path, iconId);
								this.display();
							}).open();
						})
				)
				.addExtraButton((b) =>
					b
						.setIcon('folder-cog')
						.setTooltip('Subfolder icon')
						.onClick(() => {
							new IconPickerModal(this.app, this.wayfinder.iconSource.ids(), (iconId) => {
								this.store.setChildIcon(path, iconId);
								this.display();
							}).open();
						})
				)
				.addExtraButton((b) =>
					b
						.setIcon(entry.emphasis === 'dim' ? 'sun' : 'moon')
						.setTooltip(entry.emphasis === 'dim' ? 'Remove dimming' : 'Dim (archive style)')
						.onClick(() => {
							this.store.setFolderEmphasis(path, entry.emphasis === 'dim' ? null : 'dim');
							this.display();
						})
				)
				.addExtraButton((b) =>
					b
						.setIcon('bell')
						.setTooltip(entry.countBadge ? 'Remove count badge' : 'Count badge when non-empty')
						.onClick(() => {
							this.store.setFolderCountBadge(path, !entry.countBadge);
							this.display();
						})
				)
				.addExtraButton((b) =>
					b
						.setIcon('trash-2')
						.setTooltip('Remove all rules for this folder')
						.onClick(() => {
							this.store.clearFolder(path);
							this.display();
						})
				);
		}
	}

	/** Ordered, per-channel frontmatter-signal rules. */
	private displaySignalRules(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('Frontmatter signals').setHeading();

		const rules = this.store.state.signals;
		const ready = this.wayfinder.isMetadataReady();

		new Setting(containerEl)
			.setName('Add signal rule')
			.setDesc(
				ready
					? 'Style files by top-level frontmatter. Rules run top to bottom; higher rules take precedence.'
					: 'Style files by frontmatter. Suggestions are still loading — custom entry works now.'
			)
			.addButton((b) => b.setButtonText('Add rule…').onClick(() => this.openSignalModal(null)));

		rules.forEach((rule, i) => {
			const row = new Setting(containerEl).setName(`${rule.property} = ${rule.equals}`);
			this.renderSignalChips(row.descEl, rule);
			row.settingEl.toggleClass('wayfinder-signal-disabled', !rule.enabled);

			row
				.addExtraButton((b) =>
					b
						.setIcon(rule.enabled ? 'eye' : 'eye-off')
						.setTooltip(rule.enabled ? 'Disable' : 'Enable')
						.onClick(() => {
							this.store.setSignalRuleEnabled(rule.id, !rule.enabled);
							this.display();
						})
				)
				.addExtraButton((b) =>
					b
						.setIcon('chevron-up')
						.setTooltip('Move up')
						.setDisabled(i === 0)
						.onClick(() => {
							this.store.moveSignalRule(rule.id, -1);
							this.display();
						})
				)
				.addExtraButton((b) =>
					b
						.setIcon('chevron-down')
						.setTooltip('Move down')
						.setDisabled(i === rules.length - 1)
						.onClick(() => {
							this.store.moveSignalRule(rule.id, 1);
							this.display();
						})
				)
				.addExtraButton((b) =>
					b
						.setIcon('pencil')
						.setTooltip('Edit')
						.onClick(() => this.openSignalModal(rule))
				)
				.addExtraButton((b) =>
					b
						.setIcon('copy')
						.setTooltip('Duplicate')
						.onClick(() => {
							this.store.duplicateSignalRule(rule.id, this.newSignalId());
							this.display();
						})
				)
				.addExtraButton((b) =>
					b
						.setIcon('trash-2')
						.setTooltip('Delete')
						.onClick(() => {
							this.store.removeSignalRule(rule.id);
							this.display();
						})
				);
		});
	}

	/** Visual channel summary: icon glyph, color swatches, marker text. */
	private renderSignalChips(el: HTMLElement, rule: SignalRule): void {
		el.empty();
		if (rule.icon) {
			const s = el.createSpan({ cls: 'wayfinder-signal-chip' });
			setIcon(s, rule.icon);
		}
		for (const key of ['iconColor', 'textColor', 'rowBackground'] as const) {
			const color = rule[key];
			if (!color) continue;
			const sw = el.createSpan({ cls: 'wayfinder-signal-swatch' });
			sw.style.backgroundColor = color;
			sw.setAttribute('aria-label', `${key} ${color}`);
		}
		if (rule.marker) el.createSpan({ cls: 'wayfinder-signal-chip', text: rule.marker });
		if (!rule.icon && !rule.iconColor && !rule.textColor && !rule.rowBackground && !rule.marker) {
			el.setText('No channels');
		}
	}

	private openSignalModal(rule: SignalRule | null): void {
		new SignalRuleModal({
			app: this.app,
			iconSource: this.wayfinder.iconSource,
			inventory: this.wayfinder.buildSignalInventory(),
			initial: rule,
			newId: () => this.newSignalId(),
			onSubmit: (result) => {
				if (rule) {
					// Pass every channel explicitly (incl. undefined) so cleared channels
					// are dropped by the merge, not preserved from the old rule.
					this.store.updateSignalRule(rule.id, {
						enabled: result.enabled,
						property: result.property,
						equals: result.equals,
						icon: result.icon,
						iconColor: result.iconColor,
						textColor: result.textColor,
						rowBackground: result.rowBackground,
						marker: result.marker,
					});
				} else {
					this.store.addSignalRule(result);
				}
				this.display();
			},
		}).open();
	}

	private newSignalId(): string {
		const uuid = window.crypto?.randomUUID?.();
		return uuid ? `sig-${uuid}` : `sig-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
	}
}
