import type { ActiveFileRevealMode } from './types';

const EXPLORER = '.workspace-leaf-content[data-type="file-explorer"]';

/** Center the active file in every visible file explorer after Obsidian reveals it. */
export function centerActiveFile(
	doc: Document,
	path: string,
	mode: ActiveFileRevealMode
): boolean {
	if (mode === 'native') return false;

	let centered = false;
	const explorers = Array.from(doc.querySelectorAll(EXPLORER));
	for (const explorer of explorers) {
		const rows = Array.from(explorer.querySelectorAll<HTMLElement>('.nav-file-title[data-path]'));
		const row = rows.find((el) => el.dataset.path === path);
		if (!row?.scrollIntoView) continue;
		row.scrollIntoView({
			block: 'center',
			inline: 'nearest',
			behavior: mode === 'center-smooth' ? 'smooth' : 'instant',
		});
		centered = true;
	}
	return centered;
}
