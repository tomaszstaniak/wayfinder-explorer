import { describe, expect, it } from 'vitest';
import {
	formatTaskLine,
	parseTaskShorthand,
	resolveDate,
	shorthandToTaskLine,
} from './task-parser';

// Tuesday, 2026-07-07 — fixed reference so parsing is deterministic.
const NOW = new Date(2026, 6, 7);

describe('resolveDate', () => {
	it('resolves absolute and named dates', () => {
		expect(resolveDate('2026-07-15', NOW)).toBe('2026-07-15');
		expect(resolveDate('today', NOW)).toBe('2026-07-07');
		expect(resolveDate('tomorrow', NOW)).toBe('2026-07-08');
		expect(resolveDate('yesterday', NOW)).toBe('2026-07-06');
	});
	it('resolves relative offsets', () => {
		expect(resolveDate('3d', NOW)).toBe('2026-07-10');
		expect(resolveDate('2w', NOW)).toBe('2026-07-21');
		expect(resolveDate('1m', NOW)).toBe('2026-08-07');
	});
	it('resolves weekdays to the next occurrence', () => {
		expect(resolveDate('friday', NOW)).toBe('2026-07-10'); // Tue -> Fri = +3
		expect(resolveDate('tuesday', NOW)).toBe('2026-07-07'); // today
		expect(resolveDate('next-tuesday', NOW)).toBe('2026-07-14'); // forced +7
	});
	it('returns null for nonsense', () => {
		expect(resolveDate('someday', NOW)).toBeNull();
		expect(resolveDate('@nobody', NOW)).toBeNull();
	});
});

describe('parseTaskShorthand', () => {
	it('extracts description and leaves #tags in place', () => {
		const t = parseTaskShorthand('Ship the build #tinygenerals', NOW);
		expect(t.description).toBe('Ship the build #tinygenerals');
	});

	it('parses a full sigil line', () => {
		const t = parseTaskShorthand('Ship the build @friday !high *weekly #tg', NOW);
		expect(t).toMatchObject({
			description: 'Ship the build #tg',
			due: '2026-07-10',
			priority: 'high',
			recurrence: 'every week',
		});
	});

	it('handles priority words, numbers, and bang-runs', () => {
		expect(parseTaskShorthand('x !highest', NOW).priority).toBe('highest');
		expect(parseTaskShorthand('x !2', NOW).priority).toBe('high');
		expect(parseTaskShorthand('x !!!', NOW).priority).toBe('highest');
		expect(parseTaskShorthand('x !!', NOW).priority).toBe('high');
	});

	it('handles scheduled and start date kinds', () => {
		const t = parseTaskShorthand('x @start:today @sched:tomorrow @due:friday', NOW);
		expect(t.start).toBe('2026-07-07');
		expect(t.scheduled).toBe('2026-07-08');
		expect(t.due).toBe('2026-07-10');
	});

	it('supports quoted custom recurrence', () => {
		expect(parseTaskShorthand('x *"every 2 weeks"', NOW).recurrence).toBe('every 2 weeks');
	});

	it('leaves unrecognized @tokens in the description', () => {
		const t = parseTaskShorthand('Call @alice about @friday', NOW);
		expect(t.due).toBe('2026-07-10');
		expect(t.description).toBe('Call @alice about');
	});
});

describe('formatTaskLine', () => {
	it('emits canonical emoji order', () => {
		const line = formatTaskLine({
			description: 'Do it',
			priority: 'high',
			recurrence: 'every week',
			start: '2026-07-07',
			scheduled: '2026-07-08',
			due: '2026-07-10',
		});
		expect(line).toBe('- [ ] Do it ⏫ 🔁 every week 🛫 2026-07-07 ⏳ 2026-07-08 📅 2026-07-10');
	});
	it('honors a custom status character', () => {
		expect(formatTaskLine({ description: 'x' }, { status: '/' })).toBe('- [/] x');
	});
});

describe('shorthandToTaskLine (supports both formats)', () => {
	it('converts bare shorthand', () => {
		expect(shorthandToTaskLine('Ship it @tomorrow !high', NOW)).toBe(
			'- [ ] Ship it ⏫ 📅 2026-07-08'
		);
	});
	it('preserves an existing checkbox status and augments it', () => {
		expect(shorthandToTaskLine('- [/] Ship it @friday', NOW)).toBe('- [/] Ship it 📅 2026-07-10');
	});
	it('keeps pre-existing Tasks emoji when augmenting', () => {
		const out = shorthandToTaskLine('- [ ] Ship it 📅 2026-07-10 !high', NOW);
		expect(out).toContain('📅 2026-07-10');
		expect(out).toContain('⏫');
	});
});
