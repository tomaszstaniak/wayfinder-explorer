import { describe, expect, it } from 'vitest';
import { buildInventory } from './frontmatter-inventory';

const f = (frontmatter: Record<string, unknown> | undefined) => ({ frontmatter });

describe('buildInventory', () => {
	it('collects scalar values, groups by canonical, and counts occurrences', () => {
		const inv = buildInventory([
			f({ state: 'Active' }),
			f({ state: 'active' }),
			f({ state: 'draft' }),
			f(undefined),
		]);
		const state = inv.find((p) => p.property === 'state');
		expect(state?.distinctValues).toBe(2);
		expect(state?.totalOccurrences).toBe(3);
		const active = state?.values.find((v) => v.canonical === 'active');
		expect(active?.count).toBe(2);
	});

	it('skips non-scalar values', () => {
		const inv = buildInventory([f({ tags: ['a', 'b'], meta: { x: 1 }, ok: 'yes' })]);
		expect(inv.map((p) => p.property)).toEqual(['ok']);
	});

	it('picks display by highest count then lexical order', () => {
		const inv = buildInventory([f({ s: 'Active' }), f({ s: 'ACTIVE' }), f({ s: 'ACTIVE' })]);
		expect(inv[0]?.values[0]?.display).toBe('ACTIVE');
	});

	it('flags and truncates high-cardinality properties', () => {
		const files = Array.from({ length: 5 }, (_, i) => f({ id: `v${i}` }));
		const inv = buildInventory(files, { maxValuesPerProperty: 3 });
		const id = inv.find((p) => p.property === 'id');
		expect(id?.highCardinality).toBe(true);
		expect(id?.distinctValues).toBe(5);
		expect(id?.values).toHaveLength(3);
	});

	it('sorts properties by name for deterministic display', () => {
		const inv = buildInventory([f({ zeta: '1', alpha: '2' })]);
		expect(inv.map((p) => p.property)).toEqual(['alpha', 'zeta']);
	});
});
