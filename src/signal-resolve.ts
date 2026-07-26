import { HEX_COLOR_RE, ResolvedSignal, SIGNAL_LIMITS, SignalRule } from './types';
import { countGraphemes, matches } from './signal-match';

const CHANNELS = ['icon', 'iconColor', 'textColor', 'rowBackground', 'marker'] as const;
const HEX_CHANNELS = ['iconColor', 'textColor', 'rowBackground'] as const;

/** True if the string contains any C0/C7F control character (incl. line breaks/tabs). */
function hasControlChar(value: string): boolean {
	for (const ch of value) {
		const code = ch.codePointAt(0) ?? 0;
		if (code <= 0x1f || code === 0x7f) return true;
	}
	return false;
}

export interface ResolveOptions {
	/** When provided, a rule's icon only fills the icon channel if available. */
	isIconAvailable?: (name: string) => boolean;
}

/** Resolve the winning value per channel across ordered, enabled rules. */
export function resolveSignal(
	frontmatter: Record<string, unknown>,
	rules: readonly SignalRule[],
	opts: ResolveOptions = {}
): ResolvedSignal | null {
	const acc: ResolvedSignal = {};
	for (const rule of rules) {
		if (!rule.enabled) continue;
		if (!Object.prototype.hasOwnProperty.call(frontmatter, rule.property)) continue;
		if (!matches(frontmatter[rule.property], rule.equals)) continue;
		for (const ch of CHANNELS) {
			if (acc[ch] !== undefined) continue;
			const val = rule[ch];
			if (val === undefined) continue;
			if (ch === 'icon' && opts.isIconAvailable && !opts.isIconAvailable(val)) continue;
			acc[ch] = val;
		}
	}
	return Object.keys(acc).length > 0 ? acc : null;
}

function normalizeToNull(s: ResolvedSignal | null): ResolvedSignal | null {
	if (s === null) return null;
	return CHANNELS.every((ch) => s[ch] === undefined) ? null : s;
}

/** Per-channel structural equality; null and empty `{}` are equivalent. */
export function resolvedSignalEqual(a: ResolvedSignal | null, b: ResolvedSignal | null): boolean {
	const na = normalizeToNull(a);
	const nb = normalizeToNull(b);
	if (na === null || nb === null) return na === nb;
	return CHANNELS.every((ch) => na[ch] === nb[ch]);
}

/** Whole-map structural equality (drives scan-driven recompile gating). */
export function resolvedSignalMapsEqual(
	a: ReadonlyMap<string, ResolvedSignal>,
	b: ReadonlyMap<string, ResolvedSignal>
): boolean {
	if (a.size !== b.size) return false;
	for (const [key, va] of a) {
		const vb = b.get(key);
		if (vb === undefined) return false;
		if (!resolvedSignalEqual(va, vb)) return false;
	}
	return true;
}

/** Deep, order-sensitive equality for a rule collection (drives rescan gating). */
export function signalRulesEqual(a: readonly SignalRule[], b: readonly SignalRule[]): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		const r = a[i];
		const s = b[i];
		if (r === undefined || s === undefined) return false;
		if (
			r.id !== s.id ||
			r.enabled !== s.enabled ||
			r.property !== s.property ||
			r.equals !== s.equals ||
			r.icon !== s.icon ||
			r.iconColor !== s.iconColor ||
			r.textColor !== s.textColor ||
			r.rowBackground !== s.rowBackground ||
			r.marker !== s.marker
		) {
			return false;
		}
	}
	return true;
}

/** Trim/validate a marker; null if it is empty, has control chars, or is too long. */
export function normalizeMarker(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	const m = raw.trim();
	if (m === '' || hasControlChar(m)) return null;
	if (countGraphemes(m) > SIGNAL_LIMITS.markerMaxGraphemes) return null;
	return m;
}

/** A well-formed rule id: non-empty and within the persisted size cap. */
export function isValidSignalId(id: unknown): id is string {
	return typeof id === 'string' && id !== '' && id.length <= SIGNAL_LIMITS.idMax;
}

export interface NormalizedSignalRule {
	rule: SignalRule;
	/** True when any field was trimmed, lowercased, defaulted, or dropped. */
	changed: boolean;
	/** Channel names dropped for being invalid (e.g. 'iconColor', 'marker'). */
	issues: string[];
}

/**
 * The single source of truth for a valid, persisted rule. Used by both the
 * parser and every store mutation so invariants can never be bypassed.
 * Returns the normalized rule, whether any normalization occurred, and which
 * channels were dropped; null when the rule is unusable (empty property/value
 * or no surviving channel).
 */
export function normalizeSignalRule(input: SignalRule): NormalizedSignalRule | null {
	let changed = false;
	const issues: string[] = [];

	const rawProperty = typeof input.property === 'string' ? input.property : '';
	const property = rawProperty.trim();
	if (property !== input.property) changed = true;
	const rawEquals = typeof input.equals === 'string' ? input.equals : '';
	const equals = rawEquals.trim();
	if (equals !== input.equals) changed = true;
	if (
		property === '' ||
		property.length > SIGNAL_LIMITS.propertyMax ||
		equals === '' ||
		equals.length > SIGNAL_LIMITS.equalsMax
	) {
		return null;
	}

	const enabled = typeof input.enabled === 'boolean' ? input.enabled : true;
	if (enabled !== input.enabled) changed = true;

	const out: SignalRule = { id: input.id, enabled, property, equals };

	if (input.icon !== undefined) {
		const icon = typeof input.icon === 'string' ? input.icon.trim() : '';
		if (icon === '') {
			changed = true;
			issues.push('icon');
		} else {
			out.icon = icon;
			if (icon !== input.icon) changed = true;
		}
	}
	for (const key of HEX_CHANNELS) {
		const v = input[key];
		if (v === undefined) continue;
		const c = typeof v === 'string' && HEX_COLOR_RE.test(v) ? v.toLowerCase() : null;
		if (c === null) {
			changed = true;
			issues.push(key);
		} else {
			out[key] = c;
			if (c !== v) changed = true;
		}
	}
	if (input.marker !== undefined) {
		const mk = normalizeMarker(input.marker);
		if (mk === null) {
			changed = true;
			issues.push('marker');
		} else {
			out.marker = mk;
			if (mk !== input.marker) changed = true;
		}
	}

	const hasChannel =
		out.icon !== undefined ||
		out.iconColor !== undefined ||
		out.textColor !== undefined ||
		out.rowBackground !== undefined ||
		out.marker !== undefined;
	if (!hasChannel) return null;
	return { rule: out, changed, issues };
}
