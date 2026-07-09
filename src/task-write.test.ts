import { describe, expect, it } from 'vitest';
import { applyStatusToLine, findStatusSpan, nextStatusChar } from './task-write';

describe('findStatusSpan', () => {
	it('locates the status column in a checkbox line', () => {
		expect(findStatusSpan('- [ ] a')).toEqual({ start: 3, end: 4 });
		expect(findStatusSpan('  - [/] b')).toEqual({ start: 5, end: 6 });
	});
	it('returns null for non-checkbox lines', () => {
		expect(findStatusSpan('- a bullet')).toBeNull();
		expect(findStatusSpan('plain text [x]')).toBeNull();
	});
	it('anchors to the checkbox, not a later bracket in the body', () => {
		expect(findStatusSpan('- [ ] task with [link]')).toEqual({ start: 3, end: 4 });
	});
});

describe('nextStatusChar — binary done<->todo', () => {
	it('unchecks done and checks everything else', () => {
		expect(nextStatusChar('x')).toBe(' ');
		expect(nextStatusChar('X')).toBe(' ');
		expect(nextStatusChar(' ')).toBe('x');
		expect(nextStatusChar('/')).toBe('x');
		expect(nextStatusChar('-')).toBe('x');
	});
});

describe('applyStatusToLine', () => {
	it('flips the status char on the right line', () => {
		const content = '# note\n- [ ] task\nmore';
		const r = applyStatusToLine(content, 1, '- [ ] task', 'x');
		expect(r.ok).toBe(true);
		expect(r.content).toBe('# note\n- [x] task\nmore');
	});

	it('preserves CRLF line endings, changing only the status char', () => {
		const content = '- [ ] a\r\n- [ ] b\r\n';
		const r = applyStatusToLine(content, 1, '- [ ] b', 'x');
		expect(r.ok).toBe(true);
		expect(r.content).toBe('- [ ] a\r\n- [x] b\r\n');
	});

	it('aborts (no write) when the line no longer matches expectedRaw', () => {
		const content = '- [ ] changed since render';
		expect(applyStatusToLine(content, 0, '- [ ] stale', 'x')).toEqual({ ok: false });
	});

	it('aborts when the line index is out of range', () => {
		expect(applyStatusToLine('- [ ] only', 5, '- [ ] only', 'x')).toEqual({ ok: false });
	});

	it('aborts when the matched line is not a checkbox', () => {
		expect(applyStatusToLine('plain line', 0, 'plain line', 'x')).toEqual({ ok: false });
	});

	it('edits only the checkbox status when the body contains brackets', () => {
		const content = '- [ ] task with [link]';
		const r = applyStatusToLine(content, 0, '- [ ] task with [link]', 'x');
		expect(r.ok).toBe(true);
		expect(r.content).toBe('- [x] task with [link]');
	});

	it('aborts on a negative line index', () => {
		expect(applyStatusToLine('- [ ] a', -1, '- [ ] a', 'x')).toEqual({ ok: false });
	});

	it('aborts when newChar is not exactly one character', () => {
		expect(applyStatusToLine('- [ ] a', 0, '- [ ] a', 'xx')).toEqual({ ok: false });
		expect(applyStatusToLine('- [ ] a', 0, '- [ ] a', '')).toEqual({ ok: false });
	});
});
