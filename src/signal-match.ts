/** Canonical string for a supported scalar, or null when it can never match. */
export function canonicalizeScalar(v: unknown): string | null {
	if (typeof v === 'string') return v.trim().toLowerCase();
	if (typeof v === 'boolean') return v ? 'true' : 'false';
	if (typeof v === 'number') return Number.isFinite(v) ? String(v) : null;
	return null;
}

/** Rule values are always user text; canonicalized the same way as string scalars. */
export function canonicalizeRuleValue(input: string): string {
	return input.trim().toLowerCase();
}

/** Exact (post-canonicalization) value match; non-scalars never match. */
export function matches(fmValue: unknown, ruleValue: string): boolean {
	const c = canonicalizeScalar(fmValue);
	return c !== null && c === canonicalizeRuleValue(ruleValue);
}

interface GraphemeSegmenter {
	segment(value: string): Iterable<unknown>;
}
type SegmenterCtor = new (locale?: string, options?: { granularity: string }) => GraphemeSegmenter;

/** Grapheme-cluster count; Intl.Segmenter when present, code points otherwise. */
export function countGraphemes(value: string): number {
	const Seg = (Intl as unknown as { Segmenter?: SegmenterCtor }).Segmenter;
	if (typeof Seg === 'function') {
		const seg = new Seg(undefined, { granularity: 'grapheme' });
		return Array.from(seg.segment(value)).length;
	}
	return [...value].length;
}
