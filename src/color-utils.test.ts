import { describe, expect, it } from 'vitest';
import { deriveChildColors, hexToHsl, hslToHex } from './color-utils';
import { HEX_COLOR_RE } from './types';

describe('hex/hsl round trip', () => {
	it('round-trips common colors within rounding error', () => {
		for (const hex of ['#d96a4b', '#6b9e58', '#64808f', '#a78bfa', '#000000', '#ffffff']) {
			const { h, s, l } = hexToHsl(hex);
			const back = hexToHsl(hslToHex(h, s, l));
			expect(Math.abs(back.l - l)).toBeLessThan(1.5);
			expect(Math.abs(back.s - s)).toBeLessThan(2.5);
		}
	});
});

describe('deriveChildColors', () => {
	it('is deterministic and emits valid hex', () => {
		const a = deriveChildColors('#d96a4b', 5, 'spread');
		const b = deriveChildColors('#d96a4b', 5, 'spread');
		expect(a).toEqual(b);
		for (const c of a) expect(c).toMatch(HEX_COLOR_RE);
	});

	it('shades keep the hue and vary lightness', () => {
		const base = hexToHsl('#d96a4b');
		const out = deriveChildColors('#d96a4b', 4, 'shades').map(hexToHsl);
		for (const c of out) expect(Math.abs(c.h - base.h)).toBeLessThan(3);
		const lightnesses = out.map((c) => Math.round(c.l));
		expect(new Set(lightnesses).size).toBeGreaterThan(1);
	});

	it('analogous spreads hues symmetrically within ±60°', () => {
		const base = hexToHsl('#6b9e58');
		const out = deriveChildColors('#6b9e58', 5, 'analogous').map(hexToHsl);
		const hues = out.map((c) => c.h);
		for (const h of hues) {
			const diff = Math.min(Math.abs(h - base.h), 360 - Math.abs(h - base.h));
			expect(diff).toBeLessThanOrEqual(61);
		}
		expect(new Set(hues.map(Math.round)).size).toBe(5);
	});

	it('spread produces distinct hues via the golden angle', () => {
		const out = deriveChildColors('#64808f', 6, 'spread').map(hexToHsl);
		expect(new Set(out.map((c) => Math.round(c.h))).size).toBe(6);
	});
});
