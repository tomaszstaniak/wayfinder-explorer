export const FOLDER_ICON = 'folder';
export const FILE_FALLBACK_ICON = 'file';

/**
 * Default file icons by path suffix, case-insensitive.
 * Longest matching suffix wins (the compiler emits ascending by suffix
 * length so later, longer suffixes override at equal specificity).
 * Each entry lists candidate icon names; the first available is used.
 */
export const SUFFIX_ICONS: ReadonlyArray<{ suffix: string; icons: readonly string[] }> = [
	{ suffix: '.excalidraw.md', icons: ['pencil-ruler'] },
	{ suffix: '.md', icons: ['file-text'] },
	{ suffix: '.canvas', icons: ['layout-dashboard'] },
	{ suffix: '.pdf', icons: ['file-type', 'file-text'] },
	...['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif'].map((e) => ({
		suffix: '.' + e,
		icons: ['image'] as const,
	})),
	...['mp3', 'wav', 'm4a', 'ogg', 'flac'].map((e) => ({
		suffix: '.' + e,
		icons: ['file-audio'] as const,
	})),
	...['mp4', 'mov', 'webm', 'mkv'].map((e) => ({
		suffix: '.' + e,
		icons: ['file-video'] as const,
	})),
	...['csv', 'xls', 'xlsx'].map((e) => ({ suffix: '.' + e, icons: ['table'] as const })),
	...['zip', '7z', 'rar', 'gz', 'tar'].map((e) => ({
		suffix: '.' + e,
		icons: ['file-archive'] as const,
	})),
	...['js', 'jsx', 'ts', 'tsx', 'py', 'json', 'yaml', 'yml', 'css', 'html', 'sh', 'sql', 'go', 'rs', 'java', 'c', 'cpp'].map(
		(e) => ({ suffix: '.' + e, icons: ['file-code'] as const })
	),
];

/**
 * Content-detected file types: a frontmatter key marks the file as a
 * special type that deserves its own icon regardless of extension.
 * First available candidate wins.
 */
export const FRONTMATTER_ICONS: ReadonlyArray<{ key: string; icons: readonly string[] }> = [
	{ key: 'kanban-plugin', icons: ['square-kanban', 'kanban', 'layout-list'] },
	{ key: 'excalidraw-plugin', icons: ['pencil-ruler'] },
];

/** Source of SVG icons; production wraps Obsidian's getIcon/getIconIds. */
export interface IconSource {
	/** All available icon ids (for the picker). */
	ids(): string[];
	/** The icon's <svg> element, or null when unavailable. */
	svg(name: string): SVGSVGElement | null;
}

/** Serialize an SVG element into a CSS url() usable as mask-image. */
export function svgToMaskUri(svg: SVGSVGElement): string {
	const clone = svg.cloneNode(true) as SVGSVGElement;
	if (!clone.getAttribute('xmlns')) {
		clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
	}
	const markup = clone.outerHTML;
	return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}")`;
}

/** Caches mask URIs per icon name for the session. */
export class IconResolver {
	private cache = new Map<string, string | null>();

	constructor(private readonly source: IconSource) {}

	/** Mask URI for the icon, or null when the icon does not exist. */
	resolve = (name: string): string | null => {
		const cached = this.cache.get(name);
		if (cached !== undefined) return cached;
		const svg = this.source.svg(name);
		const uri = svg ? svgToMaskUri(svg) : null;
		this.cache.set(name, uri);
		return uri;
	};
}
