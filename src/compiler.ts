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
		`\tbackground-color: currentColor;`,
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

export function compile(state: WayfinderData, resolve: IconUriResolver): CompileResult {
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

	// --- layer 2: default icons ------------------------------------------

	if (state.settings.defaultFolderIcons) {
		const uri = icon([FOLDER_ICON]);
		if (uri) {
			parts.push(`${SCOPE} .nav-folder-title-content::before { ${iconVars(uri)} }`);
		}
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

	// --- layer 3: folder color scopes, shallowest first -------------------

	const scopes = Object.entries(state.folders)
		.filter(([, entry]) => 'color' in entry)
		.sort(([a], [b]) => depthOf(a) - depthOf(b) || (a < b ? -1 : 1));

	for (const [path, entry] of scopes) {
		const esc = escapeCssString(path);
		const color = entry.color;
		if (color === null || color === undefined) {
			// Explicit opt-out: neutralize the ancestor wash on this subtree.
			parts.push(`${rowsOfScope(esc)} { background-color: transparent; }`);
			continue;
		}
		if (state.settings.tintStrength > 0) {
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
		.filter(([, entry]) => entry.icon)
		.sort(([a], [b]) => (a < b ? -1 : 1));
	for (const [path, entry] of folderIcons) {
		const uri = icon([entry.icon as string]);
		if (!uri) continue;
		parts.push(
			`${SCOPE} .nav-folder-title[data-path="${escapeCssString(path)}"] .nav-folder-title-content::before { ${iconVars(uri)} }`
		);
	}

	const fileIcons = Object.entries(state.files)
		.filter(([, entry]) => entry.icon)
		.sort(([a], [b]) => (a < b ? -1 : 1));
	for (const [path, entry] of fileIcons) {
		const uri = icon([entry.icon as string]);
		if (!uri) continue;
		parts.push(
			`${SCOPE} .nav-file-title[data-path="${escapeCssString(path)}"] .nav-file-title-content::before { ${iconVars(uri)} }`
		);
	}

	return { css: parts.join('\n'), missingIcons: [...missing].sort() };
}
