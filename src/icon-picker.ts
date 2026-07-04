import { App, FuzzyMatch, FuzzySuggestModal, setIcon } from 'obsidian';

/** Searchable picker over Obsidian's bundled icon ids. */
export class IconPickerModal extends FuzzySuggestModal<string> {
	constructor(
		app: App,
		private readonly iconIds: string[],
		private readonly onChoose: (iconId: string) => void
	) {
		super(app);
		this.setPlaceholder('Search icons…');
	}

	getItems(): string[] {
		return this.iconIds;
	}

	getItemText(iconId: string): string {
		return iconId.replace(/^lucide-/, '');
	}

	renderSuggestion(match: FuzzyMatch<string>, el: HTMLElement): void {
		el.addClass('wayfinder-icon-suggestion');
		const iconEl = el.createSpan({ cls: 'wayfinder-icon-suggestion-icon' });
		setIcon(iconEl, match.item);
		const textEl = el.createSpan();
		super.renderSuggestion(match, textEl);
	}

	onChooseItem(iconId: string): void {
		this.onChoose(iconId);
	}
}
