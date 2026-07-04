/**
 * Escape a value for embedding inside a double-quoted CSS string
 * (attribute selectors). Handles quotes, backslashes, and control
 * characters; all other code points (Unicode, emoji) pass through.
 */
export function escapeCssString(value: string): string {
	let out = '';
	for (const ch of value) {
		const code = ch.codePointAt(0) ?? 0;
		if (ch === '"' || ch === '\\') {
			out += '\\' + ch;
		} else if (code < 0x20 || code === 0x7f) {
			out += '\\' + code.toString(16) + ' ';
		} else {
			out += ch;
		}
	}
	return out;
}
