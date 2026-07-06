import { ChildColorScheme } from './types';

export interface Hsl {
	h: number; // 0..360
	s: number; // 0..100
	l: number; // 0..100
}

export function hexToHsl(hex: string): Hsl {
	const r = parseInt(hex.slice(1, 3), 16) / 255;
	const g = parseInt(hex.slice(3, 5), 16) / 255;
	const b = parseInt(hex.slice(5, 7), 16) / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	if (max === min) return { h: 0, s: 0, l: l * 100 };
	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	let h: number;
	if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
	else if (max === g) h = ((b - r) / d + 2) * 60;
	else h = ((r - g) / d + 4) * 60;
	return { h, s: s * 100, l: l * 100 };
}

export function hslToHex(h: number, s: number, l: number): string {
	const hh = ((h % 360) + 360) % 360;
	const ss = Math.min(100, Math.max(0, s)) / 100;
	const ll = Math.min(100, Math.max(0, l)) / 100;
	const c = (1 - Math.abs(2 * ll - 1)) * ss;
	const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
	const m = ll - c / 2;
	let rgb: [number, number, number];
	if (hh < 60) rgb = [c, x, 0];
	else if (hh < 120) rgb = [x, c, 0];
	else if (hh < 180) rgb = [0, c, x];
	else if (hh < 240) rgb = [0, x, c];
	else if (hh < 300) rgb = [x, 0, c];
	else rgb = [c, 0, x];
	const toHex = (v: number) =>
		Math.round((v + m) * 255)
			.toString(16)
			.padStart(2, '0');
	return `#${toHex(rgb[0])}${toHex(rgb[1])}${toHex(rgb[2])}`;
}

/** Alternating lightness offsets: 0, +8, -8, +16, -16, … */
function shadeOffset(i: number): number {
	if (i === 0) return 0;
	const step = Math.ceil(i / 2) * 8;
	return i % 2 === 1 ? step : -step;
}

/**
 * Derive `count` child colors from a base color.
 * Deterministic: same base, count, and scheme always yield the same list.
 *
 * - shades:    monochromatic — same hue, children fan out in lightness
 * - analogous: neighboring hues, total spread capped at ±60°
 * - spread:    golden-angle rotation — maximally distinct hues
 */
export function deriveChildColors(
	base: string,
	count: number,
	scheme: ChildColorScheme
): string[] {
	const { h, s, l } = hexToHsl(base);
	const out: string[] = [];
	for (let i = 0; i < count; i++) {
		if (scheme === 'shades') {
			out.push(hslToHex(h, s, Math.min(78, Math.max(30, l + shadeOffset(i)))));
		} else if (scheme === 'analogous') {
			const step = count > 1 ? Math.min(24, 120 / (count - 1)) : 0;
			out.push(hslToHex(h + (i - (count - 1) / 2) * step, s, l));
		} else {
			// spread
			out.push(hslToHex(h + i * 137.508, s, l));
		}
	}
	return out;
}
