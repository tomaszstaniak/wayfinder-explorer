export const SCHEMA_VERSION = 1;

/**
 * color:
 *   - "#rrggbb"  -> this folder roots a color scope
 *   - null       -> explicit opt-out: subtree is plain even under a colored ancestor
 *   - absent     -> inherit from nearest configured ancestor
 */
export interface FolderEntry {
	color?: string | null;
	icon?: string;
}

export interface FileEntry {
	icon?: string;
}

export interface WayfinderSettings {
	defaultFileIcons: boolean;
	defaultFolderIcons: boolean;
	/** Background wash strength, integer percent. */
	tintStrength: number;
	/** Main line width, integer px. */
	lineWidth: number;
	/** Show the number of items directly inside each folder. */
	showFolderCounts: boolean;
	/** What folder counts measure: direct children or notes in the subtree. */
	folderCountMode: FolderCountMode;
}

export type FolderCountMode = 'items' | 'notes';
export const FOLDER_COUNT_MODES: readonly FolderCountMode[] = ['items', 'notes'];

export interface WayfinderData {
	version: number;
	folders: Record<string, FolderEntry>;
	files: Record<string, FileEntry>;
	settings: WayfinderSettings;
}

export const SETTINGS_BOUNDS = {
	tintStrength: { min: 0, max: 25 },
	lineWidth: { min: 1, max: 3 },
} as const;

export const DEFAULT_SETTINGS: WayfinderSettings = {
	defaultFileIcons: true,
	defaultFolderIcons: true,
	tintStrength: 9,
	lineWidth: 2,
	showFolderCounts: false,
	folderCountMode: 'items',
};

export function defaultData(): WayfinderData {
	return {
		version: SCHEMA_VERSION,
		folders: {},
		files: {},
		settings: { ...DEFAULT_SETTINGS },
	};
}

export const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;
