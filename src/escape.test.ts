import { describe, expect, it } from 'vitest';
import { escapeCssString } from './escape';

describe('escapeCssString', () => {
	it('passes plain paths through', () => {
		expect(escapeCssString('01 Projects/Example Project')).toBe('01 Projects/Example Project');
	});
	it('escapes double quotes', () => {
		expect(escapeCssString('say "hi"')).toBe('say \\"hi\\"');
	});
	it('escapes backslashes', () => {
		expect(escapeCssString('a\\b')).toBe('a\\\\b');
	});
	it('escapes control characters as hex with trailing space', () => {
		expect(escapeCssString('a\nb')).toBe('a\\a b');
		expect(escapeCssString('a\tb')).toBe('a\\9 b');
		expect(escapeCssString('a\x7fb')).toBe('a\\7f b');
	});
	it('passes Unicode and emoji through untouched', () => {
		expect(escapeCssString('Zażółć 🚀/ノート')).toBe('Zażółć 🚀/ノート');
	});
});
