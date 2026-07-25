import { describe, expect, it } from 'vitest';
import {
	resolveSignal,
	resolvedSignalEqual,
	resolvedSignalMapsEqual,
	signalRulesEqual,
	normalizeSignalRule,
	isValidSignalId,
} from './signal-resolve';
import { ResolvedSignal, SignalRule } from './types';

function rule(p: Partial<SignalRule>): SignalRule {
	return {
		id: p.id ?? 'r',
		enabled: p.enabled ?? true,
		property: p.property ?? 'state',
		equals: p.equals ?? 'active',
		...p,
	};
}

describe('resolveSignal', () => {
	it('composes channels across rules, first-match-wins per channel', () => {
		const rules = [
			rule({ id: 'a', property: 'state', equals: 'active', textColor: '#4f9d69', marker: '●' }),
			rule({ id: 'b', property: 'type', equals: 'contract', icon: 'file-signature', textColor: '#000000' }),
		];
		const out = resolveSignal({ state: 'active', type: 'contract' }, rules);
		expect(out).toEqual({ textColor: '#4f9d69', marker: '●', icon: 'file-signature' });
	});
	it('skips disabled rules', () => {
		const rules = [rule({ id: 'a', enabled: false, textColor: '#111111' })];
		expect(resolveSignal({ state: 'active' }, rules)).toBeNull();
	});
	it('ignores inherited keys (not own properties)', () => {
		const rules = [rule({ property: 'toString', equals: 'x', marker: '!' })];
		expect(resolveSignal({ state: 'active' }, rules)).toBeNull();
	});
	it('does not match __proto__ from the prototype chain', () => {
		const rules = [rule({ property: '__proto__', equals: '[object object]', marker: '!' })];
		expect(resolveSignal({ state: 'active' }, rules)).toBeNull();
	});
	it('falls through to the next rule when the higher icon is unavailable', () => {
		const rules = [
			rule({ id: 'a', property: 'state', equals: 'active', icon: 'missing' }),
			rule({ id: 'b', property: 'state', equals: 'active', icon: 'present' }),
		];
		const out = resolveSignal({ state: 'active' }, rules, { isIconAvailable: (n) => n === 'present' });
		expect(out).toEqual({ icon: 'present' });
	});
	it('returns null when nothing matches', () => {
		expect(resolveSignal({ state: 'done' }, [rule({ equals: 'active', marker: '●' })])).toBeNull();
	});
});

describe('resolvedSignalEqual', () => {
	it('treats identical channels as equal and nulls as equal', () => {
		expect(resolvedSignalEqual(null, null)).toBe(true);
		expect(resolvedSignalEqual({ marker: '●' }, { marker: '●' })).toBe(true);
		expect(resolvedSignalEqual({ marker: '●' }, { marker: '○' })).toBe(false);
		expect(resolvedSignalEqual(null, { marker: '●' })).toBe(false);
	});
	it('treats an empty object as equivalent to null', () => {
		expect(resolvedSignalEqual({}, null)).toBe(true);
		expect(resolvedSignalEqual({}, {})).toBe(true);
		expect(resolvedSignalEqual({}, { marker: '●' })).toBe(false);
	});
});

describe('resolvedSignalMapsEqual', () => {
	const m = (o: Record<string, ResolvedSignal>) => new Map(Object.entries(o));
	it('compares by key and per-signal equality', () => {
		expect(resolvedSignalMapsEqual(m({ a: { marker: '●' } }), m({ a: { marker: '●' } }))).toBe(true);
		expect(resolvedSignalMapsEqual(m({ a: { marker: '●' } }), m({ a: { marker: '○' } }))).toBe(false);
		expect(resolvedSignalMapsEqual(m({ a: { marker: '●' } }), m({ b: { marker: '●' } }))).toBe(false);
		expect(resolvedSignalMapsEqual(m({ a: { marker: '●' } }), m({}))).toBe(false);
	});
});

describe('signalRulesEqual', () => {
	it('detects order and field changes', () => {
		const a = [rule({ id: '1', marker: '●' }), rule({ id: '2', marker: '○' })];
		expect(signalRulesEqual(a, a.slice())).toBe(true);
		expect(signalRulesEqual(a, [a[1]!, a[0]!])).toBe(false);
		expect(signalRulesEqual(a, [rule({ id: '1', marker: '×' }), a[1]!])).toBe(false);
	});
});

describe('normalizeSignalRule', () => {
	it('trims property/equals and reports the change', () => {
		const res = normalizeSignalRule(rule({ property: ' state ', equals: ' draft ', marker: '●' }));
		expect(res).not.toBeNull();
		expect(res!.rule.property).toBe('state');
		expect(res!.rule.equals).toBe('draft');
		expect(res!.changed).toBe(true);
	});
	it('drops invalid hex channels but keeps valid ones, and reports issues', () => {
		const res = normalizeSignalRule(rule({ textColor: 'red', marker: '●', iconColor: '#ABCDEF' }));
		expect(res!.rule.textColor).toBeUndefined();
		expect(res!.rule.iconColor).toBe('#abcdef');
		expect(res!.rule.marker).toBe('●');
		expect(res!.changed).toBe(true);
		expect(res!.issues).toContain('textColor');
	});

	it('reports no issues for a clean rule', () => {
		expect(normalizeSignalRule(rule({ marker: '●' }))!.issues).toEqual([]);
	});
	it('rejects control-character and oversized markers', () => {
		expect(normalizeSignalRule(rule({ marker: 'a\nb', iconColor: '#112233' }))!.rule.marker).toBeUndefined();
		expect(normalizeSignalRule(rule({ marker: '123456789', iconColor: '#112233' }))!.rule.marker).toBeUndefined();
	});
	it('returns null when no channel survives or property/equals empty', () => {
		expect(normalizeSignalRule(rule({ property: '', marker: '●' }))).toBeNull();
		expect(normalizeSignalRule(rule({ textColor: 'nope' }))).toBeNull();
	});
	it('defaults a non-boolean enabled to true and marks changed', () => {
		const res = normalizeSignalRule({ id: 'x', property: 's', equals: 'v', marker: '●' } as unknown as SignalRule);
		expect(res!.rule.enabled).toBe(true);
		expect(res!.changed).toBe(true);
	});
	it('reports changed=false for an already-clean rule', () => {
		const res = normalizeSignalRule(rule({ id: 'x', enabled: true, property: 's', equals: 'v', marker: '●' }));
		expect(res!.changed).toBe(false);
	});
});

describe('isValidSignalId', () => {
	it('accepts non-empty ids within the size cap', () => {
		expect(isValidSignalId('sig-1')).toBe(true);
	});
	it('rejects empty, oversized, and non-string ids', () => {
		expect(isValidSignalId('')).toBe(false);
		expect(isValidSignalId('x'.repeat(65))).toBe(false);
		expect(isValidSignalId(42)).toBe(false);
	});
});
