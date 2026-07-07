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
	/**
	 * 'dim'    -> subtree renders de-emphasized (archive style)
	 * 'normal' -> explicit reset under a dimmed ancestor
	 * absent   -> inherit
	 */
	emphasis?: Emphasis;
	/** Render this folder's count in accent color when non-zero. */
	countBadge?: boolean;
	/**
	 * Per-folder override of settings.childColorScheme: how direct
	 * subfolders derive their colors from this folder's color.
	 * Absent = follow the global setting.
	 */
	childColors?: ChildColorScheme;
	/**
	 * Default icon for every folder inside this one (existing and
	 * future), cascading until a deeper childIcon or an explicit
	 * per-folder icon overrides it.
	 */
	childIcon?: string;
	/** Explicit icon color; absent = follow settings.iconColorSource. */
	iconColor?: string;
}

export type Emphasis = 'dim' | 'normal';
export const EMPHASIS_VALUES: readonly Emphasis[] = ['dim', 'normal'];

export type ChildColorScheme = 'same' | 'shades' | 'analogous' | 'spread';
export const CHILD_COLOR_SCHEMES: readonly ChildColorScheme[] = [
	'same',
	'shades',
	'analogous',
	'spread',
];

export type ColorMode = 'background' | 'text';
export const COLOR_MODES: readonly ColorMode[] = ['background', 'text'];

export interface FileEntry {
	icon?: string;
	/** Explicit icon color; absent = follow settings.iconColorSource. */
	iconColor?: string;
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
	/** Show the theme's indent guide lines for nested folders. */
	showIndentGuides: boolean;
	/** Leader between item name and count (needs folder counts on). */
	leaderStyle: LeaderStyle;
	/** Extra spacing between root-level items, px. 0 = none. */
	rootItemSpacing: number;
	/** Indentation per nesting level, px. 0 = theme default. */
	treeIndent: number;
	/** Explorer row height, px. 0 = theme default. */
	itemHeight: number;
	/** Reduce text size when itemHeight is small. */
	scaleTextWithHeight: boolean;
	/** Whether folder colors paint row backgrounds or row text. */
	colorMode: ColorMode;
	/** Global default for how subfolders of colored folders get colors. */
	childColorScheme: ChildColorScheme;
	/** Icon used for folders when nothing more specific applies. */
	defaultFolderIcon: string;
	/** What icons are tinted with when no explicit icon color is set. */
	iconColorSource: IconColorSource;
	/** Give empty notes a blank-sheet icon instead of the note icon. */
	emptyFileIcons: boolean;
	/** Swap a note's icon while it is being actively edited. */
	editingIndicator: boolean;
	/** Icon shown on the note currently being edited. */
	editingIcon: string;
	/** Pulse the row's scope color once when editing begins. */
	editingBlink: boolean;
	/** Show an open-task count pill on folders, alongside the item count. */
	showTaskCounts: boolean;
}

export type IconColorSource = 'text' | 'folder';
export const ICON_COLOR_SOURCES: readonly IconColorSource[] = ['text', 'folder'];

export type FolderCountMode = 'items' | 'notes';
export const FOLDER_COUNT_MODES: readonly FolderCountMode[] = ['items', 'notes'];

export type LeaderStyle = 'none' | 'dots' | 'dashes' | 'line';
export const LEADER_STYLES: readonly LeaderStyle[] = ['none', 'dots', 'dashes', 'line'];

export interface WayfinderData {
	version: number;
	folders: Record<string, FolderEntry>;
	files: Record<string, FileEntry>;
	settings: WayfinderSettings;
}

export const SETTINGS_BOUNDS = {
	tintStrength: { min: 0, max: 25 },
	lineWidth: { min: 1, max: 3 },
	rootItemSpacing: { min: 0, max: 24 },
	treeIndent: { min: 8, max: 40 }, // 0 additionally allowed = theme default
	itemHeight: { min: 20, max: 40 }, // 0 additionally allowed = theme default
} as const;

export const DEFAULT_SETTINGS: WayfinderSettings = {
	defaultFileIcons: true,
	defaultFolderIcons: true,
	tintStrength: 9,
	lineWidth: 2,
	showFolderCounts: false,
	folderCountMode: 'items',
	showIndentGuides: true,
	leaderStyle: 'none',
	rootItemSpacing: 0,
	treeIndent: 0,
	itemHeight: 0,
	scaleTextWithHeight: true,
	colorMode: 'background',
	childColorScheme: 'same',
	defaultFolderIcon: 'folder',
	iconColorSource: 'text',
	emptyFileIcons: true,
	editingIndicator: false,
	editingIcon: 'pencil',
	editingBlink: true,
	showTaskCounts: false,
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
