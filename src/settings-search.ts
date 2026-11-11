const SETTING_SELECTOR = ':scope > .setting-item';

function matches(el: HTMLElement, query: string): boolean {
	return (el.textContent ?? '').toLocaleLowerCase().includes(query);
}

/** Filter setting rows while keeping section headings with their matching children. */
export function filterSettings(container: HTMLElement, rawQuery: string): number {
	const query = rawQuery.trim().toLocaleLowerCase();
	const rows = Array.from(container.querySelectorAll<HTMLElement>(SETTING_SELECTOR)).filter(
		(row) => !row.classList.contains('wayfinder-settings-search')
	);
	const empty = container.querySelector<HTMLElement>('.wayfinder-settings-empty');

	if (!query) {
		for (const row of rows) row.hidden = false;
		if (empty) empty.hidden = true;
		return rows.filter((row) => !row.classList.contains('setting-item-heading')).length;
	}

	let visible = 0;
	for (let i = 0; i < rows.length; ) {
		const row = rows[i];
		if (!row) break;
		if (!row.classList.contains('setting-item-heading')) {
			row.hidden = !matches(row, query);
			if (!row.hidden) visible++;
			i++;
			continue;
		}

		let end = i + 1;
		while (end < rows.length && !rows[end]?.classList.contains('setting-item-heading')) end++;
		const children = rows.slice(i + 1, end);
		const headingMatches = matches(row, query);
		let sectionMatches = 0;
		for (const child of children) {
			if (!child) continue;
			child.hidden = !headingMatches && !matches(child, query);
			if (!child.hidden) sectionMatches++;
		}
		row.hidden = !headingMatches && sectionMatches === 0;
		visible += sectionMatches;
		i = end;
	}

	if (empty) empty.hidden = visible > 0;
	return visible;
}
