import {
	DEFAULT_SETTINGS,
	FileEntry,
	FolderEntry,
	HEX_COLOR_RE,
	SCHEMA_VERSION,
	SETTINGS_BOUNDS,
	WayfinderData,
	WayfinderSettings,
	defaultData,
} from './types';

/** Abstracts Obsidian's Plugin.loadData/saveData for testability. */
export interface Persistence {
	load(): Promise<unknown>;
	save(data: WayfinderData): Promise<void>;
}

export interface ParseResult {
	data: WayfinderData;
	warnings: string[];
	/** True when top-level data was unusable and defaults were substituted. */
	recovered: boolean;
}

export function normalizePath(input: unknown): string | null {
	if (typeof input !== 'string') return null;
	let p = input.trim();
	p = p.replace(/\\/g, '/');
	p = p.replace(/\/{2,}/g, '/');
	p = p.replace(/^\//, '').replace(/\/$/, '');
	if (p === '' || p === '.') return null;
	return p;
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseFolderEntry(raw: unknown): FolderEntry | null {
	if (!isRecord(raw)) return null;
	const entry: FolderEntry = {};
	if ('color' in raw) {
		const c = raw.color;
		if (c === null) entry.color = null;
		else if (typeof c === 'string' && HEX_COLOR_RE.test(c)) entry.color = c.toLowerCase();
		else return null; // invalid color invalidates the entry rather than silently changing meaning
	}
	if ('icon' in raw) {
		const i = raw.icon;
		if (typeof i === 'string' && i.trim() !== '') entry.icon = i.trim();
		else return null;
	}
	return Object.keys(entry).length > 0 ? entry : null;
}

function parseFileEntry(raw: unknown): FileEntry | null {
	if (!isRecord(raw)) return null;
	if (!('icon' in raw)) return null;
	const i = raw.icon;
	if (typeof i === 'string' && i.trim() !== '') return { icon: i.trim() };
	return null;
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
	if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
	return Math.min(max, Math.max(min, Math.round(v)));
}

function parseSettings(raw: unknown): WayfinderSettings {
	const r = isRecord(raw) ? raw : {};
	return {
		defaultFileIcons:
			typeof r.defaultFileIcons === 'boolean' ? r.defaultFileIcons : DEFAULT_SETTINGS.defaultFileIcons,
		defaultFolderIcons:
			typeof r.defaultFolderIcons === 'boolean'
				? r.defaultFolderIcons
				: DEFAULT_SETTINGS.defaultFolderIcons,
		tintStrength: clampInt(
			r.tintStrength,
			SETTINGS_BOUNDS.tintStrength.min,
			SETTINGS_BOUNDS.tintStrength.max,
			DEFAULT_SETTINGS.tintStrength
		),
		lineWidth: clampInt(
			r.lineWidth,
			SETTINGS_BOUNDS.lineWidth.min,
			SETTINGS_BOUNDS.lineWidth.max,
			DEFAULT_SETTINGS.lineWidth
		),
	};
}

/**
 * Defensive parse of persisted data. Never throws.
 * - missing data -> defaults
 * - unversioned data with recognizable shape -> migrated to version 1
 * - invalid entries -> dropped with a warning
 * - unusable top-level shape -> defaults with recovered=true
 */
export function parseData(raw: unknown): ParseResult {
	const warnings: string[] = [];
	if (raw === null || raw === undefined) {
		return { data: defaultData(), warnings, recovered: false };
	}
	if (!isRecord(raw)) {
		warnings.push('Wayfinder: stored data was not an object; using defaults.');
		return { data: defaultData(), warnings, recovered: true };
	}
	if ('version' in raw && raw.version !== SCHEMA_VERSION) {
		warnings.push(`Wayfinder: unknown data version ${String(raw.version)}; using defaults.`);
		return { data: defaultData(), warnings, recovered: true };
	}

	const data = defaultData();
	data.settings = parseSettings(raw.settings);

	const rawFolders = isRecord(raw.folders) ? raw.folders : {};
	for (const [key, value] of Object.entries(rawFolders)) {
		const path = normalizePath(key);
		const entry = path === null ? null : parseFolderEntry(value);
		if (path === null || entry === null) {
			warnings.push(`Wayfinder: dropped invalid folder entry "${key}".`);
			continue;
		}
		data.folders[path] = entry;
	}

	const rawFiles = isRecord(raw.files) ? raw.files : {};
	for (const [key, value] of Object.entries(rawFiles)) {
		const path = normalizePath(key);
		const entry = path === null ? null : parseFileEntry(value);
		if (path === null || entry === null) {
			warnings.push(`Wayfinder: dropped invalid file entry "${key}".`);
			continue;
		}
		data.files[path] = entry;
	}

	return { data, warnings, recovered: false };
}

function isPrefixed(key: string, folderPath: string): boolean {
	return key.startsWith(folderPath + '/');
}

function rewriteKeys<T>(
	map: Record<string, T>,
	oldPath: string,
	newPath: string
): { map: Record<string, T>; changed: boolean } {
	let changed = false;
	const out: Record<string, T> = {};
	for (const [key, value] of Object.entries(map)) {
		if (key === oldPath) {
			out[newPath] = value;
			changed = true;
		} else if (isPrefixed(key, oldPath)) {
			out[newPath + key.slice(oldPath.length)] = value;
			changed = true;
		} else {
			out[key] = value;
		}
	}
	return { map: out, changed };
}

function removeKeys<T>(
	map: Record<string, T>,
	path: string
): { map: Record<string, T>; changed: boolean } {
	let changed = false;
	const out: Record<string, T> = {};
	for (const [key, value] of Object.entries(map)) {
		if (key === path || isPrefixed(key, path)) {
			changed = true;
			continue;
		}
		out[key] = value;
	}
	return { map: out, changed };
}

export type StoreListener = () => void;

export class Store {
	private data: WayfinderData = defaultData();
	private saveChain: Promise<void> = Promise.resolve();
	private listeners = new Set<StoreListener>();
	/** Set by load(); the host surfaces these once. */
	loadWarnings: string[] = [];
	/** Called (once per failure) when a queued save rejects. */
	onSaveError: ((err: unknown) => void) | null = null;

	constructor(private readonly persistence: Persistence) {}

	async load(): Promise<void> {
		let raw: unknown = null;
		try {
			raw = await this.persistence.load();
		} catch (err) {
			this.loadWarnings.push(`Wayfinder: could not read stored data (${String(err)}).`);
		}
		const result = parseData(raw);
		this.data = result.data;
		this.loadWarnings.push(...result.warnings);
	}

	get state(): Readonly<WayfinderData> {
		return this.data;
	}

	subscribe(listener: StoreListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	// --- mutations ---------------------------------------------------------

	setFolderColor(path: string, color: string | null): boolean {
		const p = normalizePath(path);
		if (p === null) return false;
		if (color !== null && !HEX_COLOR_RE.test(color)) return false;
		const prev = this.data.folders[p];
		const next: FolderEntry = { ...prev, color: color === null ? null : color.toLowerCase() };
		return this.putFolder(p, next);
	}

	/** Remove the local color property -> inherit from ancestors. */
	inheritFolderColor(path: string): boolean {
		const p = normalizePath(path);
		if (p === null) return false;
		const prev = this.data.folders[p];
		if (!prev || !('color' in prev)) return false;
		const rest: FolderEntry = { ...prev };
		delete rest.color;
		return this.putFolder(p, rest);
	}

	setFolderIcon(path: string, icon: string): boolean {
		const p = normalizePath(path);
		const i = icon.trim();
		if (p === null || i === '') return false;
		return this.putFolder(p, { ...this.data.folders[p], icon: i });
	}

	removeFolderIcon(path: string): boolean {
		const p = normalizePath(path);
		if (p === null) return false;
		const prev = this.data.folders[p];
		if (!prev?.icon) return false;
		const rest: FolderEntry = { ...prev };
		delete rest.icon;
		return this.putFolder(p, rest);
	}

	setFileIcon(path: string, icon: string): boolean {
		const p = normalizePath(path);
		const i = icon.trim();
		if (p === null || i === '') return false;
		this.data = { ...this.data, files: { ...this.data.files, [p]: { icon: i } } };
		this.commit();
		return true;
	}

	removeFileIcon(path: string): boolean {
		const p = normalizePath(path);
		if (p === null || !this.data.files[p]) return false;
		const files = { ...this.data.files };
		delete files[p];
		this.data = { ...this.data, files };
		this.commit();
		return true;
	}

	updateSettings(patch: Partial<WayfinderSettings>): boolean {
		const next = parseSettings({ ...this.data.settings, ...patch });
		if (JSON.stringify(next) === JSON.stringify(this.data.settings)) return false;
		this.data = { ...this.data, settings: next };
		this.commit();
		return true;
	}

	/**
	 * Rename/move. Rewrites the exact key and, for folders, every key under
	 * oldPath + "/" in both maps. `foo` never matches `foobar`.
	 */
	handleRename(oldPath: string, newPath: string): boolean {
		const from = normalizePath(oldPath);
		const to = normalizePath(newPath);
		if (from === null || to === null || from === to) return false;
		const folders = rewriteKeys(this.data.folders, from, to);
		const files = rewriteKeys(this.data.files, from, to);
		if (!folders.changed && !files.changed) return false;
		this.data = { ...this.data, folders: folders.map, files: files.map };
		this.commit();
		return true;
	}

	handleDelete(path: string): boolean {
		const p = normalizePath(path);
		if (p === null) return false;
		const folders = removeKeys(this.data.folders, p);
		const files = removeKeys(this.data.files, p);
		if (!folders.changed && !files.changed) return false;
		this.data = { ...this.data, folders: folders.map, files: files.map };
		this.commit();
		return true;
	}

	/** Resolves when all queued saves have settled. Test/shutdown hook. */
	flush(): Promise<void> {
		return this.saveChain;
	}

	// --- internals ---------------------------------------------------------

	private putFolder(path: string, entry: FolderEntry): boolean {
		const folders = { ...this.data.folders };
		if (Object.keys(entry).length === 0) {
			if (!(path in folders)) return false;
			delete folders[path];
		} else {
			if (JSON.stringify(folders[path]) === JSON.stringify(entry)) return false;
			folders[path] = entry;
		}
		this.data = { ...this.data, folders };
		this.commit();
		return true;
	}

	private commit(): void {
		const snapshot = this.data;
		// Serialize saves: a save never starts before the previous one settles,
		// so rapid UI operations cannot complete out of order.
		this.saveChain = this.saveChain.then(() =>
			this.persistence.save(snapshot).catch((err) => {
				this.onSaveError?.(err);
			})
		);
		for (const listener of this.listeners) listener();
	}
}
