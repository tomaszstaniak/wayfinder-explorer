import { App, ButtonComponent, FuzzySuggestModal, Modal, Setting, TextComponent, setIcon } from 'obsidian';
import { ColorPickerModal } from './color-picker';
import { IconPickerModal } from './icon-picker';
import { IconSource } from './icons';
import { PropertyStat } from './frontmatter-inventory';
import { normalizeSignalRule } from './signal-resolve';
import { SignalRule } from './types';

const SIGNAL_BG_ALPHA = 18;

/** Fuzzy picker over a fixed string list; custom entry is handled by the caller. */
export class StringSuggestModal extends FuzzySuggestModal<string> {
	constructor(
		app: App,
		private readonly items: string[],
		private readonly onChoose: (v: string) => void,
		placeholder: string
	) {
		super(app);
		this.setPlaceholder(placeholder);
	}
	getItems(): string[] {
		return this.items;
	}
	getItemText(item: string): string {
		return item;
	}
	onChooseItem(item: string): void {
		this.onChoose(item);
	}
}

export interface SignalRuleModalDeps {
	app: App;
	iconSource: IconSource;
	inventory: PropertyStat[];
	/** Existing rule to edit, or null to create. */
	initial: SignalRule | null;
	/** Generate an id for a new rule. */
	newId: () => string;
	onSubmit: (rule: SignalRule) => void;
}

type ColorChannel = 'iconColor' | 'textColor' | 'rowBackground';

/** Focused editor for one signal rule: property, value, five channels, preview. */
export class SignalRuleModal extends Modal {
	private draft: SignalRule;
	private preview!: HTMLElement;
	private saveBtn!: ButtonComponent;
	private equalsInput!: TextComponent;

	constructor(private readonly deps: SignalRuleModalDeps) {
		super(deps.app);
		this.draft = deps.initial
			? { ...deps.initial }
			: { id: deps.newId(), enabled: true, property: '', equals: '' };
	}

	onOpen(): void {
		this.setTitle(this.deps.initial ? 'Edit signal rule' : 'New signal rule');
		const { contentEl } = this;

		new Setting(contentEl)
			.setName('Property')
			.setDesc('Frontmatter key (exact, case-sensitive). Type a custom key or pick an observed one.')
			.addText((t) =>
				t.setValue(this.draft.property).onChange((v) => {
					this.draft.property = v;
					this.refresh();
				})
			)
			.addExtraButton((b) =>
				b
					.setIcon('list')
					.setTooltip('Observed keys')
					.onClick(() => {
						new StringSuggestModal(
							this.app,
							this.deps.inventory.map((p) => p.property),
							(key) => {
								this.draft.property = key;
								this.reopen();
							},
							'Search frontmatter keys…'
						).open();
					})
			);

		new Setting(contentEl)
			.setName('Equals')
			.setDesc('Value to match (case-insensitive, trimmed). Custom text is always allowed.')
			.addText((t) => {
				this.equalsInput = t;
				t.setValue(this.draft.equals).onChange((v) => {
					this.draft.equals = v;
					this.refresh();
				});
			})
			.addExtraButton((b) =>
				b
					.setIcon('list')
					.setTooltip('Observed values')
					.onClick(() => {
						const stat = this.deps.inventory.find((p) => p.property === this.draft.property);
						const items = stat ? stat.values.map((v) => v.display) : [];
						new StringSuggestModal(
							this.app,
							items,
							(val) => {
								this.draft.equals = val;
								this.equalsInput.setValue(val);
								this.refresh();
							},
							stat?.highCardinality ? `${stat.distinctValues} values — type to match` : 'Search values…'
						).open();
					})
			);

		this.iconRow(contentEl);
		this.colorRow(contentEl, 'Icon color', 'iconColor');
		this.colorRow(contentEl, 'Text color', 'textColor');
		this.colorRow(contentEl, 'Row background', 'rowBackground');

		new Setting(contentEl)
			.setName('Marker')
			.setDesc('1–8 characters/emoji shown after the name. Leave empty for none.')
			.addText((t) =>
				t.setValue(this.draft.marker ?? '').onChange((v) => {
					const trimmed = v.trim();
					this.draft.marker = trimmed === '' ? undefined : trimmed;
					this.refresh();
				})
			);

		this.preview = contentEl.createDiv({ cls: 'wayfinder-signal-preview' });

		new Setting(contentEl)
			.addButton((b) => {
				this.saveBtn = b;
				b.setButtonText('Save')
					.setCta()
					.onClick(() => {
						const norm = normalizeSignalRule(this.draft);
						if (!norm) return;
						this.close();
						this.deps.onSubmit(norm.rule);
					});
			})
			.addButton((b) => b.setButtonText('Cancel').onClick(() => this.close()));

		this.refresh();
	}

	/** Rebuild after a picker changed a field (modals stack; refresh in place). */
	private reopen(): void {
		this.contentEl.empty();
		this.onOpen();
	}

	private iconRow(parent: HTMLElement): void {
		new Setting(parent)
			.setName('Icon')
			.setDesc(this.draft.icon ? `Currently: ${this.draft.icon}` : 'Not set')
			.addButton((b) =>
				b.setButtonText('Choose…').onClick(() => {
					new IconPickerModal(this.app, this.deps.iconSource.ids(), (iconId) => {
						this.draft.icon = iconId;
						this.reopen();
					}).open();
				})
			)
			.addExtraButton((b) =>
				b
					.setIcon('x')
					.setTooltip('Clear')
					.onClick(() => {
						this.draft.icon = undefined;
						this.reopen();
					})
			);
	}

	private colorRow(parent: HTMLElement, name: string, key: ColorChannel): void {
		new Setting(parent)
			.setName(name)
			.setDesc(this.draft[key] ? `Currently: ${this.draft[key]}` : 'Not set')
			.addButton((b) =>
				b.setButtonText('Choose…').onClick(() => {
					new ColorPickerModal(this.app, this.draft[key] ?? null, (color) => {
						this.draft[key] = color;
						this.reopen();
					}).open();
				})
			)
			.addExtraButton((b) =>
				b
					.setIcon('x')
					.setTooltip('Clear')
					.onClick(() => {
						this.draft[key] = undefined;
						this.reopen();
					})
			);
	}

	/** Live preview of all five channels plus Save enablement. */
	private refresh(): void {
		const el = this.preview;
		el.empty();
		if (this.draft.icon) {
			const iconEl = el.createSpan({ cls: 'wayfinder-signal-preview-icon' });
			setIcon(iconEl, this.draft.icon);
			iconEl.style.color = this.draft.iconColor ?? this.draft.textColor ?? 'var(--text-normal)';
		}
		const name = el.createSpan({ text: 'Example note' });
		name.style.color = this.draft.textColor ?? 'var(--text-normal)';
		if (this.draft.marker) {
			el.createSpan({ cls: 'wayfinder-signal-preview-marker', text: this.draft.marker });
		}
		el.style.backgroundColor = this.draft.rowBackground
			? `color-mix(in srgb, ${this.draft.rowBackground} ${SIGNAL_BG_ALPHA}%, transparent)`
			: 'transparent';

		this.saveBtn.setDisabled(normalizeSignalRule(this.draft) === null);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
