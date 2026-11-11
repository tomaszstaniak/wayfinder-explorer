// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { filterSettings } from './settings-search';

function setting(container: HTMLElement, text: string, heading = false): HTMLElement {
	const el = document.createElement('div');
	el.className = `setting-item${heading ? ' setting-item-heading' : ''}`;
	el.textContent = text;
	container.append(el);
	return el;
}

describe('filterSettings', () => {
	it('filters standalone settings and preserves the search row', () => {
		const container = document.createElement('div');
		const search = setting(container, 'Search settings');
		search.classList.add('wayfinder-settings-search');
		const icons = setting(container, 'Default file icons');
		const colors = setting(container, 'Background tint strength');

		expect(filterSettings(container, 'icons')).toBe(1);
		expect(search.hidden).toBe(false);
		expect(icons.hidden).toBe(false);
		expect(colors.hidden).toBe(true);
	});

	it('keeps a heading when a child matches', () => {
		const container = document.createElement('div');
		const heading = setting(container, 'Navigation', true);
		const active = setting(container, 'Active file position');
		const other = setting(container, 'Tree indentation');

		filterSettings(container, 'active file');
		expect(heading.hidden).toBe(false);
		expect(active.hidden).toBe(false);
		expect(other.hidden).toBe(true);
	});

	it('shows every child when its section heading matches', () => {
		const container = document.createElement('div');
		const heading = setting(container, 'Tasks', true);
		const counts = setting(container, 'Show open-task counts');
		const pane = setting(container, 'Global tasks pane');

		expect(filterSettings(container, 'tasks')).toBe(2);
		expect(heading.hidden).toBe(false);
		expect(counts.hidden).toBe(false);
		expect(pane.hidden).toBe(false);
	});

	it('shows an empty message when nothing matches', () => {
		const container = document.createElement('div');
		setting(container, 'Navigation', true);
		setting(container, 'Active file position');
		const empty = document.createElement('div');
		empty.className = 'wayfinder-settings-empty';
		container.append(empty);
		empty.hidden = true;

		expect(filterSettings(container, 'does not exist')).toBe(0);
		expect(empty.hidden).toBe(false);
	});
});
