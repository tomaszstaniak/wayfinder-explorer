export type DueBucket = 'overdue' | 'today' | 'next7' | 'later' | 'none';

const pad = (n: number): string => String(n).padStart(2, '0');

/** True only for a real `YYYY-MM-DD` calendar date. */
export function isValidDate(s: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
	const parts = s.split('-');
	const y = Number(parts[0]);
	const m = Number(parts[1]);
	const d = Number(parts[2]);
	const dt = new Date(Date.UTC(y, m - 1, d));
	return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** `dateStr` + `days`, computed in UTC (no DST drift), formatted `YYYY-MM-DD`. */
export function addDaysUTC(dateStr: string, days: number): string {
	const parts = dateStr.split('-');
	const ms = Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])) + days * 86400000;
	const dt = new Date(ms);
	return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Which due bucket `due` falls in relative to `today` (both `YYYY-MM-DD`). */
export function dueBucket(due: string | undefined, today: string): DueBucket {
	if (!due || !isValidDate(due)) return 'none';
	if (due < today) return 'overdue';
	if (due === today) return 'today';
	if (due <= addDaysUTC(today, 7)) return 'next7';
	return 'later';
}

/** The user's local calendar date as `YYYY-MM-DD`. */
export function localToday(now: Date): string {
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Milliseconds from `now` until the next local midnight. */
export function msUntilNextLocalMidnight(now: Date): number {
	const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
	return next.getTime() - now.getTime();
}
