/**
 * Insert a Tasks-plugin query block scoped to the current note.
 * Uses the Tasks 8.2.2 `query` object for an EXACT current-file match
 * (`path includes` would be substring and could over-match).
 */
export const TASKS_IN_NOTE_BLOCK = [
	'```tasks',
	'not done',
	'filter by function task.file.path === query.file.path',
	'```',
].join('\n');

/**
 * A vault-wide open-tasks dashboard, grouped by path and prioritized.
 * `group by path` (not `filename`) and one `sort by` field per line are the
 * forms confirmed against the installed Tasks 8.2.2 parser.
 */
export const TASKS_DASHBOARD_BLOCK = [
	'```tasks',
	'not done',
	'group by path',
	'sort by priority',
	'sort by due',
	'```',
].join('\n');

/**
 * Wrap `block` so it always begins on its own line and ends with a newline.
 * `before` is the current line's text up to the cursor; a fence is only
 * recognized at line start, so prepend a newline when real text precedes it.
 *
 * Note: this only guards the text BEFORE the cursor. When the cursor sits
 * mid-line (`abc|def`), `replaceSelection` leaves the remainder trailing the
 * block's closing newline (`abc\nBLOCK\ndef`). That is acceptable and expected.
 */
export function blockInsertText(block: string, before: string): string {
	const leadingNewline = before.trim().length > 0 ? '\n' : '';
	return `${leadingNewline}${block}\n`;
}
