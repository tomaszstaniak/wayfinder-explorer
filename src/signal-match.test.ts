import { describe, expect, it } from 'vitest';
import { canonicalizeScalar, canonicalizeRuleValue, matches, countGraphemes } from './signal-match';

describe('canonicalizeScalar', () => {
	it('trims and lowercases strings', () => {
		expect(canonicalizeScalar(' Active ')).toBe('active');
	});
	it('maps booleans to true/false', () => {
		expect(canonicalizeScalar(true)).toBe('true');
		expect(canonicalizeScalar(false)).toBe('false');
	});
	it('stringifies finite numbers only', () => {
		expect(canonicalizeScalar(1)).toBe('1');
		expect(canonicalizeScalar(1.5)).toBe('1.5');
		expect(canonicalizeScalar(NaN)).toBeNull();
		expect(canonicalizeScalar(Infinity)).toBeNull();
	});
	it('ignores null, arrays and objects', () => {
		expect(canonicalizeScalar(null)).toBeNull();
		expect(canonicalizeScalar(undefined)).toBeNull();
		expect(canonicalizeScalar(['a'])).toBeNull();
		expect(canonicalizeScalar({ a: 1 })).toBeNull();
	});
});

describe('matches', () => {
	it('matches boolean true against the text "true"', () => {
		expect(matches(true, 'true')).toBe(true);
		expect(matches(true, 'TRUE')).toBe(true);
	});
	it('is case-insensitive and trimmed on values', () => {
		expect(matches('Active', ' active ')).toBe(true);
	});
	it('keeps quoted "01" distinct from number 1', () => {
		expect(matches('01', '1')).toBe(false);
		expect(matches(1, '1')).toBe(true);
	});
	it('never matches non-scalars', () => {
		expect(matches(null, 'null')).toBe(false);
		expect(matches(['x'], 'x')).toBe(false);
	});
});

describe('canonicalizeRuleValue', () => {
	it('trims and lowercases', () => {
		expect(canonicalizeRuleValue('  Draft ')).toBe('draft');
	});
});

describe('countGraphemes', () => {
	it('counts ZWJ-joined emoji as one cluster when Segmenter exists', () => {
		expect(countGraphemes('👩‍👧')).toBe(1);
		expect(countGraphemes('ab●')).toBe(3);
	});
	it('falls back to code points when Segmenter is absent', () => {
		const original = (Intl as unknown as { Segmenter?: unknown }).Segmenter;
		(Intl as unknown as { Segmenter?: unknown }).Segmenter = undefined;
		try {
			expect(countGraphemes('ab')).toBe(2);
			expect(countGraphemes('●')).toBe(1);
		} finally {
			(Intl as unknown as { Segmenter?: unknown }).Segmenter = original;
		}
	});
});
