import { App, Modal } from 'obsidian';
import { shorthandToTaskLine } from './task-parser';

/**
 * Single-line task capture with a live preview of the compiled Tasks
 * line. The opposite of Tasks' multi-field modal: you type shorthand,
 * you see the canonical line update as you type, Enter inserts it.
 */
export class TaskModal extends Modal {
	private inputEl!: HTMLInputElement;
	private previewEl!: HTMLElement;

	constructor(
		app: App,
		private readonly onSubmit: (line: string) => void
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle('Quick add task');
		const { contentEl } = this;

		this.inputEl = contentEl.createEl('input', {
			type: 'text',
			cls: 'wayfinder-task-input',
		});
		this.inputEl.placeholder = 'Task  @friday !high *weekly #tag';

		this.previewEl = contentEl.createEl('div', { cls: 'wayfinder-task-preview' });
		contentEl.createEl('div', {
			cls: 'wayfinder-task-hint',
			text: '@date (today · tomorrow · friday · 3d · 2026-07-15) — !priority (high · !!! · 2) — *recurrence (weekly · "every 2 weeks")',
		});

		this.inputEl.addEventListener('input', () => this.refresh());
		this.inputEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				this.submit();
			}
		});

		this.refresh();
		window.setTimeout(() => this.inputEl.focus(), 0);
	}

	private refresh(): void {
		const raw = this.inputEl.value.trim();
		this.previewEl.setText(raw ? shorthandToTaskLine(this.inputEl.value, new Date()) : ' ');
	}

	private submit(): void {
		const raw = this.inputEl.value.trim();
		if (!raw) return;
		this.onSubmit(shorthandToTaskLine(this.inputEl.value, new Date()));
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
