import { canonicalizeScalar } from './signal-match';

export interface ValueStat {
	canonical: string;
	display: string;
	count: number;
}

export interface PropertyStat {
	property: string;
	values: ValueStat[];
	highCardinality: boolean;
	distinctValues: number;
	totalOccurrences: number;
}

const DEFAULT_MAX_VALUES = 50;

/** Display for a scalar as originally observed (not lowercased). */
function displayOf(v: unknown): string {
	return typeof v === 'string' ? v : String(v);
}

/**
 * Build the property -> observed-values inventory from cached frontmatter.
 * Top-level scalars only; deterministic ordering; high-cardinality summarized.
 */
export function buildInventory(
	files: Iterable<{ frontmatter: Record<string, unknown> | undefined }>,
	opts: { maxValuesPerProperty?: number } = {}
): PropertyStat[] {
	const max = opts.maxValuesPerProperty ?? DEFAULT_MAX_VALUES;
	// property -> canonical -> (display -> count)
	const acc = new Map<string, Map<string, Map<string, number>>>();

	for (const { frontmatter } of files) {
		if (!frontmatter) continue;
		for (const key of Object.keys(frontmatter)) {
			const canonical = canonicalizeScalar(frontmatter[key]);
			if (canonical === null) continue;
			const display = displayOf(frontmatter[key]);
			let byCanonical = acc.get(key);
			if (!byCanonical) acc.set(key, (byCanonical = new Map<string, Map<string, number>>()));
			let byDisplay = byCanonical.get(canonical);
			if (!byDisplay) byCanonical.set(canonical, (byDisplay = new Map<string, number>()));
			byDisplay.set(display, (byDisplay.get(display) ?? 0) + 1);
		}
	}

	const stats: PropertyStat[] = [];
	for (const [property, byCanonical] of acc) {
		const values: ValueStat[] = [];
		for (const [canonical, byDisplay] of byCanonical) {
			let count = 0;
			let bestDisplay = '';
			let bestCount = -1;
			for (const [display, c] of byDisplay) {
				count += c;
				if (c > bestCount || (c === bestCount && display < bestDisplay)) {
					bestCount = c;
					bestDisplay = display;
				}
			}
			values.push({ canonical, display: bestDisplay, count });
		}
		values.sort((a, b) => b.count - a.count || (a.canonical < b.canonical ? -1 : 1));
		const distinctValues = values.length;
		const totalOccurrences = values.reduce((sum, v) => sum + v.count, 0);
		stats.push({
			property,
			values: distinctValues > max ? values.slice(0, max) : values,
			highCardinality: distinctValues > max,
			distinctValues,
			totalOccurrences,
		});
	}
	stats.sort((a, b) => (a.property < b.property ? -1 : a.property > b.property ? 1 : 0));
	return stats;
}
