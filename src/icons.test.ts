// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { IconResolver, IconSource, SUFFIX_ICONS, svgToMaskUri } from './icons';

function makeSvg(inner = '<path d="M0 0h24v24H0z"/>'): SVGSVGElement {
	const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	el.setAttribute('viewBox', '0 0 24 24');
	el.innerHTML = inner;
	return el;
}

describe('svgToMaskUri', () => {
	it('produces an encoded data-uri url()', () => {
		const uri = svgToMaskUri(makeSvg());
		expect(uri.startsWith('url("data:image/svg+xml;charset=utf-8,')).toBe(true);
		expect(uri.endsWith('")')).toBe(true);
		const encoded = uri.slice('url("data:image/svg+xml;charset=utf-8,'.length, -2);
		const decoded = decodeURIComponent(encoded);
		expect(decoded).toContain('xmlns="http://www.w3.org/2000/svg"');
		expect(decoded).toContain('viewBox="0 0 24 24"');
	});

	it('contains no raw quotes that would break the CSS url string', () => {
		const uri = svgToMaskUri(makeSvg('<path d="M1 1"/>'));
		expect(uri.slice(5, -2)).not.toContain('"');
	});
});

describe('IconResolver', () => {
	it('caches lookups including misses', () => {
		let calls = 0;
		const source: IconSource = {
			ids: () => ['known'],
			svg: (name) => {
				calls++;
				return name === 'known' ? makeSvg() : null;
			},
		};
		const r = new IconResolver(source);
		expect(r.resolve('known')).toBeTruthy();
		expect(r.resolve('known')).toBeTruthy();
		expect(r.resolve('missing')).toBeNull();
		expect(r.resolve('missing')).toBeNull();
		expect(calls).toBe(2);
	});
});

describe('SUFFIX_ICONS', () => {
	it('has unique suffixes', () => {
		const suffixes = SUFFIX_ICONS.map((s) => s.suffix);
		expect(new Set(suffixes).size).toBe(suffixes.length);
	});
	it('all suffixes start with a dot and are lowercase', () => {
		for (const { suffix } of SUFFIX_ICONS) {
			expect(suffix.startsWith('.')).toBe(true);
			expect(suffix).toBe(suffix.toLowerCase());
		}
	});
});
