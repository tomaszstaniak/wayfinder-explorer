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
 *
 * Kept deliberately lean because Tasks renders every matching task in the
 * whole vault: `limit` caps the row count while `short mode` and hiding the
 * per-row buttons/backlinks cut DOM weight — both matter a lot in large/legacy
 * vaults. Users can raise the limit, drop `short mode`, or add
 * `path does not include <folder>` lines to trim legacy areas. This block is a
 * quick helper, not the long-term cross-vault task surface (that will be a
 * Wayfinder-owned pane using our own extractor + capped rendering).
 */
export const TASKS_DASHBOARD_BLOCK = [
	'```tasks',
	'not done',
	'group by path',
	'sort by priority',
	'sort by due',
	'limit 100',
	'short mode',
	'hide edit button',
	'hide postpone button',
	'hide backlinks',
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
