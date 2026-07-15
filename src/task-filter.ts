import type { IndexedTask, TaskStatus } from './task-extract';
import type { Priority } from './task-parser';
import { dueBucket, type DueBucket } from './task-dates';
import { isWithinFolder } from './task-count';

export type Grouping = 'note' | 'due' | 'priority' | 'status';
export type Sort = 'due' | 'priority';
export type DueFilter = 'any' | 'overdue' | 'today' | 'next7' | 'hasDate' | 'noDate';

export interface Filters {
	pathScope?: string;
	statuses: ReadonlySet<TaskStatus>;
	minPriority?: Priority;
	due?: DueFilter;
	text?: string;
}
export interface DeriveConfig {
	filters: Filters;
	grouping: Grouping;
	sort: Sort;
	limit: number;
}
export interface GroupView {
	key: string;
	label: string;
	visibleCount: number;
	tasks: readonly IndexedTask[];
}
export interface DerivedView {
	groups: readonly GroupView[];
	shown: number;
	total: number;
}

export const OPEN_STATUSES: ReadonlySet<TaskStatus> = new Set<TaskStatus>([
	'todo',
	'inProgress',
	'other',
]);

const PRIORITY_RANK: Record<Priority, number> = { highest: 5, high: 4, medium: 3, low: 2, lowest: 1 };
const BUCKET_ORDER: Record<DueBucket, number> = { overdue: 0, today: 1, next7: 2, later: 3, none: 4 };
const DUE_LABEL: Record<DueBucket, string> = {
	overdue: 'Overdue',
	today: 'Today',
	next7: 'Next 7 days',
	later: 'Later',
	none: 'No date',
};
const STATUS_ORDER: Record<TaskStatus, number> = {
	todo: 0,
	inProgress: 1,
	done: 2,
	cancelled: 3,
	other: 4,
};
const STATUS_LABEL: Record<TaskStatus, string> = {
	todo: 'Todo',
	inProgress: 'In Progress',
	done: 'Done',
	cancelled: 'Cancelled',
	other: 'Other',
};
const PRIORITY_LABEL: Record<Priority, string> = {
	highest: 'Highest',
	high: 'High',
	medium: 'Medium',
	low: 'Low',
	lowest: 'Lowest',
};

export function normalizeFolderScope(raw: string): string {
	return raw.trim().replace(/^\/+/, '').replace(/\/+$/, '');
}

function basename(path: string): string {
	const parts = path.split('/');
	return parts[parts.length - 1] ?? path;
}

function prRank(t: IndexedTask): number {
	return t.priority ? PRIORITY_RANK[t.priority] : 0;
}

function dueMatches(due: string | undefined, filter: DueFilter, today: string): boolean {
	const b = dueBucket(due, today);
	switch (filter) {
		case 'overdue':
			return b === 'overdue';
		case 'today':
			return b === 'today';
		case 'next7':
			return b === 'next7';
		case 'hasDate':
			return b !== 'none';
		case 'noDate':
			return b === 'none';
		default:
			return true;
	}
}

function passes(t: IndexedTask, f: Filters, scope: string, today: string): boolean {
	if (!f.statuses.has(t.status)) return false;
	if (scope && !isWithinFolder(t.path, scope)) return false;
	if (f.minPriority) {
		if (!t.priority) return false;
		if (PRIORITY_RANK[t.priority] < PRIORITY_RANK[f.minPriority]) return false;
	}
	if (f.due && f.due !== 'any' && !dueMatches(t.due, f.due, today)) return false;
	if (f.text) {
		const q = f.text.toLowerCase();
		if (!t.text.toLowerCase().includes(q) && !t.path.toLowerCase().includes(q)) return false;
	}
	return true;
}

// Dated-ascending, undated last.
function cmpDueAsc(a: IndexedTask, b: IndexedTask): number {
	const da = a.due;
	const db = b.due;
	if (da && db) return da < db ? -1 : da > db ? 1 : 0;
	if (da) return -1;
	if (db) return 1;
	return 0;
}
function cmpPriorityDesc(a: IndexedTask, b: IndexedTask): number {
	return prRank(b) - prRank(a);
}
function cmpIntra(a: IndexedTask, b: IndexedTask, sort: Sort): number {
	if (sort === 'due') {
		return cmpDueAsc(a, b) || cmpPriorityDesc(a, b) || a.path.localeCompare(b.path) || a.line - b.line;
	}
	return cmpPriorityDesc(a, b) || cmpDueAsc(a, b) || a.path.localeCompare(b.path) || a.line - b.line;
}
function cmpGroup(a: IndexedTask, b: IndexedTask, grouping: Grouping, today: string): number {
	switch (grouping) {
		case 'note':
			return a.path.localeCompare(b.path);
		case 'due':
			return BUCKET_ORDER[dueBucket(a.due, today)] - BUCKET_ORDER[dueBucket(b.due, today)];
		case 'priority':
			return prRank(b) - prRank(a);
		case 'status':
			return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
	}
}

function groupKeyOf(t: IndexedTask, grouping: Grouping, today: string): string {
	switch (grouping) {
		case 'note':
			return t.path;
		case 'due':
			return dueBucket(t.due, today);
		case 'priority':
			return t.priority ?? 'none';
		case 'status':
			return t.status;
	}
}
function groupLabelOf(t: IndexedTask, grouping: Grouping, today: string): string {
	switch (grouping) {
		case 'note':
			return basename(t.path);
		case 'due':
			return DUE_LABEL[dueBucket(t.due, today)];
		case 'priority':
			return t.priority ? PRIORITY_LABEL[t.priority] : 'No priority';
		case 'status':
			return STATUS_LABEL[t.status];
	}
}

export function deriveView(
	tasks: readonly IndexedTask[],
	config: DeriveConfig,
	today: string
): DerivedView {
	const { filters, grouping, sort, limit } = config;
	const scope = filters.pathScope ? normalizeFolderScope(filters.pathScope) : '';

	const matched = tasks.filter((t) => passes(t, filters, scope, today));
	const total = matched.length;

	const ordered = matched
		.slice()
		.sort((a, b) => cmpGroup(a, b, grouping, today) || cmpIntra(a, b, sort));

	const slice = ordered.slice(0, limit);

	const groups: { key: string; label: string; tasks: IndexedTask[] }[] = [];
	let current: { key: string; label: string; tasks: IndexedTask[] } | null = null;
	for (const task of slice) {
		const key = groupKeyOf(task, grouping, today);
		if (!current || current.key !== key) {
			current = { key, label: groupLabelOf(task, grouping, today), tasks: [] };
			groups.push(current);
		}
		current.tasks.push(task);
	}

	const views: GroupView[] = groups.map((g) => ({
		key: g.key,
		label: g.label,
		visibleCount: g.tasks.length,
		tasks: g.tasks,
	}));

	return { groups: views, shown: slice.length, total };
}
