// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { StyleManager } from './style-manager';

describe('StyleManager', () => {
	it('mounts exactly one style element and removes it on unmount', () => {
		const sm = new StyleManager(document);
		sm.mount();
		sm.mount(); // idempotent
		expect(document.querySelectorAll('style[data-wayfinder]')).toHaveLength(1);
		sm.unmount();
		expect(document.querySelectorAll('style[data-wayfinder]')).toHaveLength(0);
	});

	it('writes CSS into the managed element', () => {
		const sm = new StyleManager(document);
		sm.mount();
		sm.setCss('body { color: red; }');
		expect(document.querySelector('style[data-wayfinder]')?.textContent).toBe(
			'body { color: red; }'
		);
		sm.unmount();
	});

	it('ignores setCss when unmounted', () => {
		const sm = new StyleManager(document);
		sm.setCss('x');
		expect(document.querySelector('style[data-wayfinder]')).toBeNull();
	});
});
