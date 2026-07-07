/**
 * Parses a humane task shorthand into structured fields, then formats
 * it as a canonical Tasks-plugin line. Pure and deterministic: the
 * reference date is injected, so no Date.now() here.
 *
 * Shorthand (sigil hybrid):
 *   @<date>            due date            @today @tomorrow @friday @2026-07-15 @3d
 *   @sched:<date>      scheduled date
 *   @start:<date>      start date
 *   !high / !!! / !2   priority
 *   *weekly / *"every 2 weeks"   recurrence
 * Everything else (including #tags) stays in the description.
 */

export type Priority = 'highest' | 'high' | 'medium' | 'low' | 'lowest';

export interface ParsedTask {
	description: string;
	due?: string; // YYYY-MM-DD
	scheduled?: string;
	start?: string;
	priority?: Priority;
	recurrence?: string; // e.g. "every week"
}

export interface FormatOptions {
	/** Status character inside the checkbox; ' ' = todo. */
	status?: string;
}

const PRIORITY_EMOJI: Record<Priority, string> = {
	highest: '🔺',
	high: '⏫',
	medium: '🔼',
	low: '🔽',
	lowest: '⏬',
};

const PRIORITY_WORDS: Record<string, Priority> = {
	highest: 'highest',
	high: 'high',
	medium: 'medium',
	med: 'medium',
	low: 'low',
	lowest: 'lowest',
	'1': 'highest',
	'2': 'high',
	'3': 'medium',
	'4': 'low',
	'5': 'lowest',
};

const RECURRENCE_WORDS: Record<string, string> = {
	daily: 'every day',
	weekly: 'every week',
	monthly: 'every month',
	yearly: 'every year',
	annually: 'every year',
};

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function pad(n: number): string {
	return String(n).padStart(2, '0');
}

function ymd(d: Date): string {
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(now: Date, days: number): Date {
	return new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
}

/** Resolve a date word to YYYY-MM-DD, or null if unrecognized. */
export function resolveDate(word: string, now: Date): string | null {
	const w = word.toLowerCase();
	if (/^\d{4}-\d{2}-\d{2}$/.test(w)) return w;
	if (w === 'today') return ymd(now);
	if (w === 'tomorrow') return ymd(addDays(now, 1));
	if (w === 'yesterday') return ymd(addDays(now, -1));

	const rel = w.match(/^(\d+)([dwmy])$/); // 3d, 2w, 1m, 1y
	if (rel) {
		const n = parseInt(rel[1]!, 10);
		if (rel[2] === 'd') return ymd(addDays(now, n));
		if (rel[2] === 'w') return ymd(addDays(now, n * 7));
		if (rel[2] === 'm') return ymd(new Date(now.getFullYear(), now.getMonth() + n, now.getDate()));
		if (rel[2] === 'y') return ymd(new Date(now.getFullYear() + n, now.getMonth(), now.getDate()));
	}

	const wd = WEEKDAYS.indexOf(w.replace(/^next-?/, ''));
	if (wd !== -1) {
		const forceNext = w.startsWith('next');
		let delta = (wd - now.getDay() + 7) % 7;
		if (delta === 0 && forceNext) delta = 7; // "next monday" on a monday -> +7
		if (forceNext && delta < 7 && wd === now.getDay()) delta = 7;
		return ymd(addDays(now, delta));
	}
	return null;
}

function resolvePriority(token: string): Priority | null {
	if (/^!+$/.test(token)) {
		// bang-run: ! medium, !! high, !!! highest
		return token.length >= 3 ? 'highest' : token.length === 2 ? 'high' : 'medium';
	}
	const word = token.replace(/^!/, '').toLowerCase();
	return PRIORITY_WORDS[word] ?? null;
}

function resolveRecurrence(value: string): string {
	const w = value.toLowerCase();
	return RECURRENCE_WORDS[w] ?? value; // else already phrased like "every 2 weeks"
}

export function parseTaskShorthand(input: string, now: Date): ParsedTask {
	const task: ParsedTask = { description: '' };
	let rest = ` ${input} `;

	// recurrence: *word or *"multi word"
	rest = rest.replace(/\s\*(?:"([^"]+)"|(\S+))/g, (_m: string, quoted?: string, bare?: string) => {
		task.recurrence = resolveRecurrence(quoted ?? bare ?? '');
		return ' ';
	});

	// priority: !word, !1..!5, or bang-run
	rest = rest.replace(/\s(!+\w*|![1-5])/g, (_m: string, tok: string) => {
		const p = resolvePriority(tok);
		if (p) {
			task.priority = p;
			return ' ';
		}
		return _m;
	});

	// dates: @[due:|sched:|scheduled:|start:]value
	rest = rest.replace(
		/\s@(?:(due|scheduled|sched|start):)?(\S+)/g,
		(_m: string, kind: string | undefined, value: string) => {
			const resolved = resolveDate(value, now);
			if (!resolved) return _m; // leave unrecognized @tokens in the description
			if (kind === 'start') task.start = resolved;
			else if (kind === 'scheduled' || kind === 'sched') task.scheduled = resolved;
			else task.due = resolved;
			return ' ';
		}
	);

	task.description = rest.replace(/\s+/g, ' ').trim();
	return task;
}

export function formatTaskLine(task: ParsedTask, opts: FormatOptions = {}): string {
	const status = opts.status ?? ' ';
	const parts = [`- [${status}]`, task.description];
	if (task.priority) parts.push(PRIORITY_EMOJI[task.priority]);
	if (task.recurrence) parts.push(`🔁 ${task.recurrence}`);
	if (task.start) parts.push(`🛫 ${task.start}`);
	if (task.scheduled) parts.push(`⏳ ${task.scheduled}`);
	if (task.due) parts.push(`📅 ${task.due}`);
	return parts.filter((p) => p !== '').join(' ');
}

const CHECKBOX_RE = /^\s*[-*] \[(.)\]\s*(.*)$/;

/**
 * Shorthand text straight to a canonical line. Supports both our
 * shorthand and native Tasks lines: if the input already begins with a
 * checkbox (any status, e.g. `- [/]`), that status is preserved and the
 * remainder — including any existing Tasks emoji — is kept, so you can
 * add `@friday`/`!high` to an existing task too.
 */
export function shorthandToTaskLine(input: string, now: Date, opts?: FormatOptions): string {
	const m = input.match(CHECKBOX_RE);
	if (m) {
		return formatTaskLine(parseTaskShorthand(m[2]!, now), { status: m[1] });
	}
	return formatTaskLine(parseTaskShorthand(input, now), opts);
}
