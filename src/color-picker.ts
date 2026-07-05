import { App, Modal, Setting } from 'obsidian';
import { HEX_COLOR_RE } from './types';

/**
 * Custom color entry. Text field is authoritative; the native color
 * input supplements it. Only a valid #rrggbb can be confirmed.
 */
export class ColorPickerModal extends Modal {
	private value: string;

	constructor(
		app: App,
		initial: string | null,
		private readonly onSubmit: (color: string) => void
	) {
		super(app);
		this.value = initial ?? '#a78bfa';
	}

	onOpen(): void {
		this.setTitle('Wayfinder: custom folder color');
		const { contentEl } = this;

		let preview: HTMLElement;
		let confirmBtn: import('obsidian').ButtonComponent;
		let textInput: import('obsidian').TextComponent;

		const isValid = () => HEX_COLOR_RE.test(this.value);
		const refresh = () => {
			preview.style.backgroundColor = isValid() ? this.value : 'transparent';
			confirmBtn.setDisabled(!isValid());
		};

		new Setting(contentEl)
			.setName('Color')
			.setDesc('Six-digit hex color such as #a78bfa')
			.addText((text) => {
				textInput = text;
				text.setValue(this.value).onChange((v) => {
					this.value = v.trim().toLowerCase();
					refresh();
				});
			})
			.addColorPicker((picker) =>
				picker.setValue(isValid() ? this.value : '#a78bfa').onChange((v) => {
					this.value = v.toLowerCase();
					textInput.setValue(this.value);
					refresh();
				})
			);

		preview = contentEl.createDiv({ cls: 'wayfinder-color-preview' });

		new Setting(contentEl)
			.addButton((btn) => {
				confirmBtn = btn;
				btn.setButtonText('Apply')
					.setCta()
					.onClick(() => {
						if (!isValid()) return;
						this.close();
						this.onSubmit(this.value);
					});
			})
			.addButton((btn) => btn.setButtonText('Cancel').onClick(() => this.close()));

		refresh();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
