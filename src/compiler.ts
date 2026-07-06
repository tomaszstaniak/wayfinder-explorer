import { deriveChildColors } from './color-utils';
import { escapeCssString } from './escape';
import { FILE_FALLBACK_ICON, FOLDER_ICON, SUFFIX_ICONS } from './icons';
import { WayfinderData } from './types';

/** Every selector is rooted here so nothing outside the explorer is touched. */
const SCOPE = '.workspace-leaf-content[data-type="file-explorer"]';

/**
 * Rows keep native styling for these states; the wash must stay
 * subordinate to selection/focus/drag feedback.
 */
const ROW_STATE_GUARD = ':not(.is-active):not(.has-focus):not(.is-being-dragged)';

const TITLE_COLOR_MIX = 80; // % of scope color in the folder title text
const LINE_COLOR_MIX = 75; // % of scope color in the main line

export interface CompileResult {
	css: string;
	/** Icon names that could not be resolved (deduplicated, sorted). */
	missingIcons: string[];
}

/** Resolve an icon name to a CSS mask url(), or null when unavailable. */
export type IconUriResolver = (name: string) => string | null;

function rowsOfScope(escaped: string): string {
	return (
		`${SCOPE} :is(.nav-folder-title, .nav-file-title)` +
		`:is([data-path="${escaped}"], [data-path^="${escaped}/"])` +
		ROW_STATE_GUARD
	);
}

function iconVars(uri: string): string {
	return `--wf-icon: ${uri}; --wf-icon-display: inline-block;`;
}

function staticBlock(): string {
	return [
		`${SCOPE} :is(.nav-folder-title-content, .nav-file-title-content)::before {`,
		`\tcontent: '';`,
		`\tdisplay: var(--wf-icon-display, none);`,
		`\twidth: var(--icon-s, 16px);`,
		`\theight: var(--icon-s, 16px);`,
		`\tmargin-inline-end: var(--size-2-2, 4px);`,
		`\tvertical-align: text-bottom;`,
		`\tflex-shrink: 0;`,
		`\tbackground-color: var(--wf-icon-color, currentColor);`,
		`\t-webkit-mask-repeat: no-repeat;`,
		`\tmask-repeat: no-repeat;`,
		`\t-webkit-mask-size: contain;`,
		`\tmask-size: contain;`,
		`\t-webkit-mask-position: center;`,
		`\tmask-position: center;`,
		`\t-webkit-mask-image: var(--wf-icon);`,
		`\tmask-image: var(--wf-icon);`,
		`}`,
	].join('\n');
}

function depthOf(path: string): number {
	return path.split('/').length;
}

/** Direct child counts per folder path; provided by the host, not persisted. */
export type FolderCounts = ReadonlyMap<string, number>;

/**
 * Content-detected icon candidates per file path (e.g. Kanban boards
 * found via frontmatter). Provided by the host, not persisted.
 */
export type ContentIcons = ReadonlyMap<string, readonly string[]>;

/** Vault-derived inputs the host supplies alongside persisted state. */
export interface HostData {
	counts?: FolderCounts;
	contentIcons?: ContentIcons;
	/** All folder paths in the vault; needed for child color schemes. */
	folderPaths?: readonly string[];
	/** Paths of zero-byte notes; they get the blank-sheet icon. */
	emptyFiles?: readonly string[];
}

/** Scope rows without the state guard (for inherited variables). */
function rowsOfScopeRaw(escaped: string): string {
	return (
		`${SCOPE} :is(.nav-folder-title, .nav-file-title)` +
		`:is([data-path="${escaped}"], [data-path^="${escaped}/"])`
	);
}

const LEADER_GRADIENTS: Record<string, string> = {
	dots: 'repeating-linear-gradient(to right, var(--wf-leader-color) 0 1px, transparent 1px 5px)',
	dashes: 'repeating-linear-gradient(to right, var(--wf-leader-color) 0 4px, transparent 4px 8px)',
	line: 'linear-gradient(var(--wf-leader-color), var(--wf-leader-color))',
};

function countsBaseBlock(settings: WayfinderData['settings']): string {
	const leader = LEADER_GRADIENTS[settings.leaderStyle];
	const parts: string[] = [
		`${SCOPE} .nav-folder-title::after {`,
		`\tfont-family: var(--font-monospace);`,
		`\tfont-size: var(--font-smallest, 0.8em);`,
		`\tcolor: var(--text-muted);`,
		`\tmargin-inline-start: auto;`,
		`\tpadding-inline-start: var(--size-4-2, 8px);`,
		...(leader
			? [
					`\t--wf-leader-color: color-mix(in srgb, var(--text-muted) 40%, transparent);`,
					`\tflex-grow: 1;`,
					`\ttext-align: right;`,
					`\tbackground-image: ${leader};`,
					`\tbackground-repeat: no-repeat;`,
					`\tbackground-position: left center;`,
				]
			: []),
		`}`,
	];
	return parts.join('\n');
}

function countRules(counts: FolderCounts, settings: WayfinderData['settings']): string[] {
	const leader = LEADER_GRADIENTS[settings.leaderStyle];
	const parts: string[] = [];
	const sorted = [...counts.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
	for (const [path, count] of sorted) {
		// The leader stops before the number: the compiler knows the count's
		// width in monospace characters, so it sizes the gradient per folder.
		const leaderSize = leader
			? ` background-size: calc(100% - ${String(count).length + 2}ch) 1px;`
			: '';
		parts.push(
			`${SCOPE} .nav-folder-title[data-path="${escapeCssString(path)}"]::after { content: "${count}";${leaderSize} }`
		);
	}
	return parts;
}

/** Accent styling (and standalone count) for non-empty badge folders. */
function badgeRules(state: WayfinderData, counts: FolderCounts): string[] {
	const parts: string[] = [];
	const badgePaths = Object.entries(state.folders)
		.filter(([, entry]) => entry.countBadge)
		.map(([path]) => path)
		.sort();
	for (const path of badgePaths) {
		const count = counts.get(path) ?? 0;
		if (count === 0) continue;
		parts.push(
			`${SCOPE} .nav-folder-title[data-path="${escapeCssString(path)}"]::after { content: "${count}"; color: var(--color-accent, var(--interactive-accent)); font-weight: var(--font-semibold, 600); background-image: none; }`
		);
	}
	return parts;
}

/** Emphasis scopes (dim/normal), depth-ordered like color scopes. */
function emphasisRules(state: WayfinderData): string[] {
	const parts: string[] = [];
	const scopes = Object.entries(state.folders)
		.filter(([, entry]) => entry.emphasis)
		.sort(([a], [b]) => depthOf(a) - depthOf(b) || (a < b ? -1 : 1));
	for (const [path, entry] of scopes) {
		const rows = rowsOfScope(escapeCssString(path));
		if (entry.emphasis === 'dim') {
			parts.push(`${rows} { opacity: 0.6; filter: saturate(0.35); }`);
		} else {
			parts.push(`${rows} { opacity: 1; filter: none; }`);
		}
	}
	return parts;
}

/** Layout adjustments; emits nothing while every setting is at its default. */
function appearanceBlock(s: WayfinderData['settings']): string[] {
	const parts: string[] = [];
	if (!s.showIndentGuides) {
		parts.push(`${SCOPE} { --nav-indentation-guide-width: 0px; }`);
	}
	if (s.rootItemSpacing > 0) {
		parts.push(
			`${SCOPE} .nav-folder.mod-root > .nav-folder-children > .tree-item { margin-bottom: ${s.rootItemSpacing}px; }`
		);
	}
	if (s.treeIndent > 0) {
		// Stock indent = children padding (4px) + margin; keep padding fixed
		// so the guide line's position stays proportional.
		parts.push(
			`${SCOPE} .tree-item-children { --nav-item-children-padding-start: 4px; --nav-item-children-margin-start: ${Math.max(0, s.treeIndent - 4)}px; }`
		);
	}
	if (s.itemHeight > 0) {
		const pad = Math.max(0, Math.round((s.itemHeight - 18) / 2));
		parts.push(
			`${SCOPE} .tree-item-self { min-height: ${s.itemHeight}px; padding-top: ${pad}px; padding-bottom: ${pad}px; align-items: center; }`
		);
		if (s.scaleTextWithHeight && s.itemHeight < 28) {
			const font = Math.max(10, Math.round(s.itemHeight * 0.46));
			parts.push(`${SCOPE} .tree-item-self { font-size: min(var(--nav-item-size), ${font}px); }`);
		}
	}
	return parts;
}

export function compile(
	state: WayfinderData,
	resolve: IconUriResolver,
	host: HostData = {}
): CompileResult {
	const counts = host.counts;
	const parts: string[] = [];
	const missing = new Set<string>();

	const icon = (candidates: readonly string[]): string | null => {
		for (const name of candidates) {
			const uri = resolve(name);
			if (uri) return uri;
			missing.add(name);
		}
		return null;
	};

	parts.push(staticBlock());
	parts.push(...appearanceBlock(state.settings));

	const hasBadges = Object.values(state.folders).some((e) => e.countBadge);
	if (counts && (state.settings.showFolderCounts || hasBadges)) {
		parts.push(countsBaseBlock(state.settings));
		if (state.settings.showFolderCounts) parts.push(...countRules(counts, state.settings));
		parts.push(...badgeRules(state, counts));
	}

	parts.push(...emphasisRules(state));

	// --- layer 2: default icons ------------------------------------------

	if (state.settings.defaultFolderIcons) {
		const uri = icon([state.settings.defaultFolderIcon, FOLDER_ICON]);
		if (uri) {
			parts.push(`${SCOPE} .nav-folder-title-content::before { ${iconVars(uri)} }`);
		}
	}

	// Subtree folder icons (childIcon): prefix selectors, so folders created
	// later match without a recompile. Depth order lets nested scopes win;
	// explicit per-folder icons in layer 4 win over these.
	const childIconScopes = Object.entries(state.folders)
		.filter(([, entry]) => entry.childIcon)
		.sort(([a], [b]) => depthOf(a) - depthOf(b) || (a < b ? -1 : 1));
	for (const [path, entry] of childIconScopes) {
		const uri = icon([entry.childIcon as string]);
		if (!uri) continue;
		parts.push(
			`${SCOPE} .nav-folder-title[data-path^="${escapeCssString(path)}/"] .nav-folder-title-content::before { ${iconVars(uri)} }`
		);
	}

	if (state.settings.defaultFileIcons) {
		const fallback = icon([FILE_FALLBACK_ICON]);
		if (fallback) {
			parts.push(`${SCOPE} .nav-file-title-content::before { ${iconVars(fallback)} }`);
		}
		// Ascending suffix length: at equal specificity, later (longer) wins.
		const bySuffix = [...SUFFIX_ICONS].sort((a, b) => a.suffix.length - b.suffix.length);
		for (const entry of bySuffix) {
			const uri = icon(entry.icons);
			if (!uri) continue;
			const sel = `${SCOPE} .nav-file-title[data-path$="${escapeCssString(entry.suffix)}" i] .nav-file-title-content::before`;
			parts.push(`${sel} { ${iconVars(uri)} }`);
		}
	}

	// --- layer 2a': empty notes get the blank-sheet icon -------------------

	if (state.settings.defaultFileIcons && state.settings.emptyFileIcons && host.emptyFiles) {
		const uri = icon([FILE_FALLBACK_ICON]);
		if (uri) {
			for (const path of [...host.emptyFiles].sort()) {
				parts.push(
					`${SCOPE} .nav-file-title[data-path="${escapeCssString(path)}"] .nav-file-title-content::before { ${iconVars(uri)} }`
				);
			}
		}
	}

	// --- layer 2b: content-detected icons (beat suffix defaults by emission
	// order; manual overrides in layer 4 still win) -------------------------

	if (state.settings.defaultFileIcons && host.contentIcons) {
		const entries = [...host.contentIcons.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
		for (const [path, candidates] of entries) {
			const uri = icon(candidates);
			if (!uri) continue;
			parts.push(
				`${SCOPE} .nav-file-title[data-path="${escapeCssString(path)}"] .nav-file-title-content::before { ${iconVars(uri)} }`
			);
		}
	}

	// --- layer 3: folder color scopes, shallowest first -------------------
	// Explicit scopes from the store, plus scopes derived for direct
	// subfolders of any folder with a child color scheme. Explicit wins.

	const scopeMap = new Map<string, string | null>();
	for (const [path, entry] of Object.entries(state.folders)) {
		// Per-folder override, else the global default.
		const scheme = entry.childColors ?? state.settings.childColorScheme;
		if (scheme === 'same' || typeof entry.color !== 'string' || !host.folderPaths) continue;
		const children = host.folderPaths
			.filter((p) => p.startsWith(path + '/') && !p.slice(path.length + 1).includes('/'))
			.sort();
		const derived = deriveChildColors(entry.color, children.length, scheme);
		children.forEach((child, i) => scopeMap.set(child, derived[i] ?? entry.color ?? null));
	}
	for (const [path, entry] of Object.entries(state.folders)) {
		if ('color' in entry) scopeMap.set(path, entry.color ?? null);
	}

	const textMode = state.settings.colorMode === 'text';
	const scopes = [...scopeMap.entries()].sort(
		([a], [b]) => depthOf(a) - depthOf(b) || (a < b ? -1 : 1)
	);

	for (const [path, color] of scopes) {
		const esc = escapeCssString(path);
		if (color === null) {
			// Explicit opt-out: neutralize the ancestor scope on this subtree.
			parts.push(
				textMode
					? `${rowsOfScope(esc)} { color: var(--nav-item-color); }`
					: `${rowsOfScope(esc)} { background-color: transparent; }`
			);
			if (state.settings.iconColorSource === 'folder') {
				parts.push(`${rowsOfScopeRaw(esc)} { --wf-icon-color: currentColor; }`);
			}
			continue;
		}
		if (state.settings.iconColorSource === 'folder') {
			parts.push(`${rowsOfScopeRaw(esc)} { --wf-icon-color: ${color}; }`);
		}
		if (textMode) {
			parts.push(
				`${rowsOfScope(esc)} { color: color-mix(in srgb, ${color} 70%, var(--text-normal)); }`
			);
		} else if (state.settings.tintStrength > 0) {
			parts.push(
				`${rowsOfScope(esc)} { background-color: color-mix(in srgb, ${color} ${state.settings.tintStrength}%, transparent); }`
			);
		}
		parts.push(
			`${SCOPE} .nav-folder-title[data-path="${esc}"] { color: color-mix(in srgb, ${color} ${TITLE_COLOR_MIX}%, var(--text-normal)); }`
		);
		parts.push(
			`${SCOPE} .nav-folder:has(> .nav-folder-title[data-path="${esc}"]) > .nav-folder-children { border-inline-start: ${state.settings.lineWidth}px solid color-mix(in srgb, ${color} ${LINE_COLOR_MIX}%, transparent); }`
		);
	}

	// --- layer 4: manual icon overrides (win over defaults) ---------------

	const folderIcons = Object.entries(state.folders)
		.filter(([, entry]) => entry.icon || entry.iconColor)
		.sort(([a], [b]) => (a < b ? -1 : 1));
	for (const [path, entry] of folderIcons) {
		const esc = escapeCssString(path);
		if (entry.icon) {
			const uri = icon([entry.icon]);
			if (uri) {
				parts.push(
					`${SCOPE} .nav-folder-title[data-path="${esc}"] .nav-folder-title-content::before { ${iconVars(uri)} }`
				);
			}
		}
		if (entry.iconColor) {
			parts.push(`${SCOPE} .nav-folder-title[data-path="${esc}"] { --wf-icon-color: ${entry.iconColor}; }`);
		}
	}

	const fileIcons = Object.entries(state.files)
		.filter(([, entry]) => entry.icon || entry.iconColor)
		.sort(([a], [b]) => (a < b ? -1 : 1));
	for (const [path, entry] of fileIcons) {
		const esc = escapeCssString(path);
		if (entry.icon) {
			const uri = icon([entry.icon]);
			if (uri) {
				parts.push(
					`${SCOPE} .nav-file-title[data-path="${esc}"] .nav-file-title-content::before { ${iconVars(uri)} }`
				);
			}
		}
		if (entry.iconColor) {
			parts.push(`${SCOPE} .nav-file-title[data-path="${esc}"] { --wf-icon-color: ${entry.iconColor}; }`);
		}
	}

	return { css: parts.join('\n'), missingIcons: [...missing].sort() };
}
