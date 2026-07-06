import { describe, expect, it } from 'vitest';
import { detectParaRoots, paraAssignments } from './para';

describe('detectParaRoots', () => {
	it('detects numbered PARA roots', () => {
		const roots = ['00 Inbox', '01 Projects', '02 Areas', '03 Resources', '04 Archive', 'Attachments'];
		expect(detectParaRoots(roots)).toEqual({
			inbox: '00 Inbox',
			projects: '01 Projects',
			areas: '02 Areas',
			resources: '03 Resources',
			archive: '04 Archive',
		});
	});

	it('detects unnumbered and singular variants', () => {
		const roots = ['Project', 'Area', 'Resource', 'Archived'];
		const r = detectParaRoots(roots);
		expect(r.projects).toBe('Project');
		expect(r.areas).toBe('Area');
		expect(r.resources).toBe('Resource');
		expect(r.archive).toBe('Archived');
		expect(r.inbox).toBeUndefined();
	});

	it('does not claim one folder for two roles', () => {
		// "Project Archive" matches projects first (PARA order), archive gets nothing else
		const r = detectParaRoots(['Project Archive']);
		expect(r.projects).toBe('Project Archive');
		expect(r.archive).toBeUndefined();
	});

	it('returns empty mapping for non-PARA vaults', () => {
		expect(detectParaRoots(['Notes', 'Daily', 'Attachments'])).toEqual({});
	});
});

describe('paraAssignments', () => {
	it('produces entries in PARA order with the gradient styles', () => {
		const a = paraAssignments({ projects: '01 Projects', archive: '04 Archive' });
		expect(a.map((x) => x.role)).toEqual(['projects', 'archive']);
		expect(a[0]!.entry.color).toBeTruthy();
		expect(a[1]!.entry).toMatchObject({ color: null, emphasis: 'dim' });
	});

	it('gives the inbox a count badge', () => {
		const a = paraAssignments({ inbox: '00 Inbox' });
		expect(a[0]!.entry.countBadge).toBe(true);
	});
});
