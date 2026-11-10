// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { centerActiveFile } from './active-file-reveal';

function explorerWith(path: string): { doc: Document; scrollIntoView: ReturnType<typeof vi.fn> } {
	const doc = document.implementation.createHTMLDocument();
	const explorer = doc.createElement('div');
	explorer.className = 'workspace-leaf-content';
	explorer.dataset.type = 'file-explorer';
	const row = doc.createElement('div');
	row.className = 'nav-file-title is-active';
	row.dataset.path = path;
	const scrollIntoView = vi.fn();
	row.scrollIntoView = scrollIntoView;
	explorer.append(row);
	doc.body.append(explorer);
	return { doc, scrollIntoView };
}

describe('centerActiveFile', () => {
	it('leaves native reveal untouched', () => {
		const { doc, scrollIntoView } = explorerWith('Projects/Plan.md');
		expect(centerActiveFile(doc, 'Projects/Plan.md', 'native')).toBe(false);
		expect(scrollIntoView).not.toHaveBeenCalled();
	});

	it('centers the exact path without animation', () => {
		const { doc, scrollIntoView } = explorerWith('Projects/Plan.md');
		expect(centerActiveFile(doc, 'Projects/Plan.md', 'center')).toBe(true);
		expect(scrollIntoView).toHaveBeenCalledWith({
			block: 'center',
			inline: 'nearest',
			behavior: 'instant',
		});
	});

	it('supports smooth centering and ignores a different path', () => {
		const { doc, scrollIntoView } = explorerWith('Projects/Plan.md');
		expect(centerActiveFile(doc, 'Areas/Plan.md', 'center-smooth')).toBe(false);
		expect(scrollIntoView).not.toHaveBeenCalled();
		expect(centerActiveFile(doc, 'Projects/Plan.md', 'center-smooth')).toBe(true);
		expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }));
	});
});
