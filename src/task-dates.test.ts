import { describe, expect, it } from 'vitest';
import { isValidDate, addDaysUTC, dueBucket, localToday, msUntilNextLocalMidnight } from './task-dates';

describe('isValidDate', () => {
	it('accepts a real calendar date', () => expect(isValidDate('2026-07-15')).toBe(true));
	it('rejects a bad shape', () => expect(isValidDate('2026-7-5')).toBe(false));
	it('rejects an impossible day', () => expect(isValidDate('2026-02-30')).toBe(false));
});

describe('addDaysUTC', () => {
	it('adds days across a month boundary', () => expect(addDaysUTC('2026-07-28', 7)).toBe('2026-08-04'));
});

describe('dueBucket', () => {
	const today = '2026-07-15';
	it('overdue', () => expect(dueBucket('2026-07-14', today)).toBe('overdue'));
	it('today', () => expect(dueBucket('2026-07-15', today)).toBe('today'));
	it('next7 includes the 7th day', () => expect(dueBucket('2026-07-22', today)).toBe('next7'));
	it('later past the 7th day', () => expect(dueBucket('2026-07-23', today)).toBe('later'));
	it('undated when absent', () => expect(dueBucket(undefined, today)).toBe('none'));
	it('undated when invalid', () => expect(dueBucket('not-a-date', today)).toBe('none'));
});

describe('localToday / msUntilNextLocalMidnight', () => {
	it('formats local Y-M-D', () => expect(localToday(new Date(2026, 6, 5, 13, 0, 0))).toBe('2026-07-05'));
	it('counts ms to next local midnight', () => {
		expect(msUntilNextLocalMidnight(new Date(2026, 6, 5, 23, 0, 0, 0))).toBe(60 * 60 * 1000);
	});
});
