import { App, Modal, Setting, setIcon } from 'obsidian';
import { PARA_ROLES, PARA_STYLE, ParaAssignment, ParaRole } from './para';

const ROLE_LABELS: Record<ParaRole, string> = {
	inbox: 'Inbox',
	projects: 'Projects',
	areas: 'Areas',
	resources: 'Resources',
	archive: 'Archive',
};

const ROLE_HINTS: Record<ParaRole, string> = {
	inbox: 'Inbox icon, count badge when non-empty',
	projects: 'Most actionable: full-saturation color',
	areas: 'Ongoing responsibilities: medium saturation',
	resources: 'Reference material: low saturation',
	archive: 'Dimmed and desaturated, no color wash',
};

/**
 * Shows what the PARA detection found and applies on confirmation.
 * Undetected roles are listed so users with unusual names know to
 * assign the same styles manually via the context menu.
 */
export class ParaPresetModal extends Modal {
	constructor(
		app: App,
		private readonly assignments: ParaAssignment[],
		private readonly onApply: (assignments: ParaAssignment[]) => void
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle('Apply PARA preset');
		const { contentEl } = this;

		contentEl.createEl('p', {
			text: 'Detected PARA folders below get colors along the actionability gradient, icons, and archive dimming. Everything is written as ordinary Wayfinder assignments — adjust or remove any of it later from the folder context menu.',
		});

		const found = new Map(this.assignments.map((a) => [a.role, a]));
		for (const role of PARA_ROLES) {
			const assignment = found.get(role);
			const setting = new Setting(contentEl)
				.setName(ROLE_LABELS[role])
				.setDesc(assignment ? ROLE_HINTS[role] : 'Not found — assign manually if needed');
			if (assignment) {
				const chip = setting.controlEl.createSpan({ cls: 'wayfinder-para-chip' });
				const style = PARA_STYLE[role];
				if (typeof style.color === 'string') chip.style.color = style.color;
				const iconEl = chip.createSpan();
				if (style.icon) setIcon(iconEl, style.icon);
				chip.createSpan({ text: assignment.path });
			}
		}

		new Setting(contentEl)
			.addButton((b) =>
				b
					.setButtonText('Apply')
					.setCta()
					.setDisabled(this.assignments.length === 0)
					.onClick(() => {
						this.close();
						this.onApply(this.assignments);
					})
			)
			.addButton((b) => b.setButtonText('Cancel').onClick(() => this.close()));
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
