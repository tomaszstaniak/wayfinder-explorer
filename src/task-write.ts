export interface StatusSpan {
	/** Column of the status char within the line. */
	start: number;
	/** Column just past the status char. */
	end: number;
}

// Same checkbox shape as the extractor: prefix, single status char, "] ".
const CHECKBOX_RE = /^([ \t]*[-*+] \[)([^\]])(\] )/;

/** Column span of the status character, or null if not a checkbox line. */
export function findStatusSpan(lineText: string): StatusSpan | null {
	const m = CHECKBOX_RE.exec(lineText);
	if (!m) return null;
	const start = m[1]!.length;
	return { start, end: start + m[2]!.length };
}

/** MVP toggle: `x`/`X` → space; every other status char → `x`. */
export function nextStatusChar(statusChar: string): string {
	return statusChar === 'x' || statusChar === 'X' ? ' ' : 'x';
}

export interface ApplyResult {
	ok: boolean;
	content?: string;
}

/**
 * Replace the status char on a 0-based line, preserving all line endings.
 * Non-fuzzy: proceeds only if the line equals expectedRaw (trailing CR
 * stripped for comparison) and is a real checkbox.
 */
export function applyStatusToLine(
	content: string,
	line: number,
	expectedRaw: string,
	newChar: string
): ApplyResult {
	// Guards: negative line would fall through to line 0; a multi-char
	// replacement would widen the checkbox.
	if (line < 0 || newChar.length !== 1) return { ok: false };
	let start = 0;
	for (let i = 0; i < line; i++) {
		const nl = content.indexOf('\n', start);
		if (nl === -1) return { ok: false };
		start = nl + 1;
	}
	let end = content.indexOf('\n', start);
	if (end === -1) end = content.length;

	let lineText = content.slice(start, end);
	if (lineText.endsWith('\r')) lineText = lineText.slice(0, -1);
	if (lineText !== expectedRaw) return { ok: false };

	const span = findStatusSpan(lineText);
	if (!span) return { ok: false };

	const statusStart = start + span.start;
	const statusEnd = start + span.end;
	return {
		ok: true,
		content: content.slice(0, statusStart) + newChar + content.slice(statusEnd),
	};
}
