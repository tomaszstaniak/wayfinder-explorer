import {
	CHILD_COLOR_SCHEMES,
	COLOR_MODES,
	ChildColorScheme,
	ColorMode,
	DEFAULT_SETTINGS,
	FOLDER_COUNT_MODES,
	FileEntry,
	EMPHASIS_VALUES,
	Emphasis,
	FolderCountMode,
	FolderEntry,
	ICON_COLOR_SOURCES,
	IconColorSource,
	LEADER_STYLES,
	LeaderStyle,
	HEX_COLOR_RE,
	SCHEMA_VERSION,
	SETTINGS_BOUNDS,
	SIGNAL_LIMITS,
	SignalRule,
	WayfinderData,
	WayfinderSettings,
	defaultData,
} from './types';
import { normalizeSignalRule, signalRulesEqual } from './signal-resolve';

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
	/** True when signals were dropped/normalized/id-repaired and should be re-persisted. */
	signalsRepaired: boolean;
}

export function normalizePath(input: unknown): string | null {
	if (typeof input !== 'string') return null;
	let p = input.trim();
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
	if ('emphasis' in raw) {
		if (EMPHASIS_VALUES.includes(raw.emphasis as Emphasis)) entry.emphasis = raw.emphasis as Emphasis;
		else return null;
	}
	if ('countBadge' in raw) {
		if (raw.countBadge === true) entry.countBadge = true;
		else return null; // false is stored as an absent property
	}
	if ('childColors' in raw) {
		if (CHILD_COLOR_SCHEMES.includes(raw.childColors as ChildColorScheme))
			entry.childColors = raw.childColors as ChildColorScheme;
		else return null;
	}
	if ('childIcon' in raw) {
		const i = raw.childIcon;
		if (typeof i === 'string' && i.trim() !== '') entry.childIcon = i.trim();
		else return null;
	}
	if ('iconColor' in raw) {
		const c = raw.iconColor;
		if (typeof c === 'string' && HEX_COLOR_RE.test(c)) entry.iconColor = c.toLowerCase();
		else return null;
	}
	if ('excludeTaskCount' in raw) {
		if (raw.excludeTaskCount === true) entry.excludeTaskCount = true;
		else return null;
	}
	return Object.keys(entry).length > 0 ? entry : null;
}

function parseFileEntry(raw: unknown): FileEntry | null {
	if (!isRecord(raw)) return null;
	const entry: FileEntry = {};
	if ('icon' in raw) {
		const i = raw.icon;
		if (typeof i === 'string' && i.trim() !== '') entry.icon = i.trim();
		else return null;
	}
	if ('iconColor' in raw) {
		const c = raw.iconColor;
		if (typeof c === 'string' && HEX_COLOR_RE.test(c)) entry.iconColor = c.toLowerCase();
		else return null;
	}
	return Object.keys(entry).length > 0 ? entry : null;
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
	if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
	return Math.min(max, Math.max(min, Math.round(v)));
}

/** Like clampInt, but 0 is a valid sentinel meaning "theme default". */
function clampIntOrZero(v: unknown, min: number, max: number, fallback: number): number {
	if (v === 0) return 0;
	return clampInt(v, min, max, fallback);
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
		showFolderCounts:
			typeof r.showFolderCounts === 'boolean'
				? r.showFolderCounts
				: DEFAULT_SETTINGS.showFolderCounts,
		folderCountMode: FOLDER_COUNT_MODES.includes(r.folderCountMode as FolderCountMode)
			? (r.folderCountMode as FolderCountMode)
			: DEFAULT_SETTINGS.folderCountMode,
		showIndentGuides:
			typeof r.showIndentGuides === 'boolean'
				? r.showIndentGuides
				: DEFAULT_SETTINGS.showIndentGuides,
		leaderStyle: LEADER_STYLES.includes(r.leaderStyle as LeaderStyle)
			? (r.leaderStyle as LeaderStyle)
			: DEFAULT_SETTINGS.leaderStyle,
		rootItemSpacing: clampInt(
			r.rootItemSpacing,
			SETTINGS_BOUNDS.rootItemSpacing.min,
			SETTINGS_BOUNDS.rootItemSpacing.max,
			DEFAULT_SETTINGS.rootItemSpacing
		),
		treeIndent: clampIntOrZero(
			r.treeIndent,
			SETTINGS_BOUNDS.treeIndent.min,
			SETTINGS_BOUNDS.treeIndent.max,
			DEFAULT_SETTINGS.treeIndent
		),
		itemHeight: clampIntOrZero(
			r.itemHeight,
			SETTINGS_BOUNDS.itemHeight.min,
			SETTINGS_BOUNDS.itemHeight.max,
			DEFAULT_SETTINGS.itemHeight
		),
		scaleTextWithHeight:
			typeof r.scaleTextWithHeight === 'boolean'
				? r.scaleTextWithHeight
				: DEFAULT_SETTINGS.scaleTextWithHeight,
		colorMode: COLOR_MODES.includes(r.colorMode as ColorMode)
			? (r.colorMode as ColorMode)
			: DEFAULT_SETTINGS.colorMode,
		childColorScheme: CHILD_COLOR_SCHEMES.includes(r.childColorScheme as ChildColorScheme)
			? (r.childColorScheme as ChildColorScheme)
			: DEFAULT_SETTINGS.childColorScheme,
		defaultFolderIcon:
			typeof r.defaultFolderIcon === 'string' && r.defaultFolderIcon.trim() !== ''
				? r.defaultFolderIcon.trim()
				: DEFAULT_SETTINGS.defaultFolderIcon,
		iconColorSource: ICON_COLOR_SOURCES.includes(r.iconColorSource as IconColorSource)
			? (r.iconColorSource as IconColorSource)
			: DEFAULT_SETTINGS.iconColorSource,
		emptyFileIcons:
			typeof r.emptyFileIcons === 'boolean' ? r.emptyFileIcons : DEFAULT_SETTINGS.emptyFileIcons,
		editingIndicator:
			typeof r.editingIndicator === 'boolean'
				? r.editingIndicator
				: DEFAULT_SETTINGS.editingIndicator,
		editingIcon:
			typeof r.editingIcon === 'string' && r.editingIcon.trim() !== ''
				? r.editingIcon.trim()
				: DEFAULT_SETTINGS.editingIcon,
		editingBlink:
			typeof r.editingBlink === 'boolean' ? r.editingBlink : DEFAULT_SETTINGS.editingBlink,
		showTaskCounts:
			typeof r.showTaskCounts === 'boolean'
				? r.showTaskCounts
				: DEFAULT_SETTINGS.showTaskCounts,
		showGlobalTaskPane:
			typeof r.showGlobalTaskPane === 'boolean'
				? r.showGlobalTaskPane
				: DEFAULT_SETTINGS.showGlobalTaskPane,
	};
}

/** Shape a raw entry into a SignalRule; normalizeSignalRule guards field types. */
function coerceRawRule(raw: unknown): SignalRule | null {
	if (!isRecord(raw)) return null;
	return {
		id: typeof raw.id === 'string' ? raw.id : '',
		enabled: raw.enabled as boolean,
		property: raw.property as string,
		equals: raw.equals as string,
		icon: raw.icon as string | undefined,
		iconColor: raw.iconColor as string | undefined,
		textColor: raw.textColor as string | undefined,
		rowBackground: raw.rowBackground as string | undefined,
		marker: raw.marker as string | undefined,
	};
}

/**
 * Defensive parse of the signal-rule collection. Never throws.
 * - Each entry runs through the shared normalizer (drop invalid channels/rules).
 * - Two-pass id repair reserves valid unique ids, then fills the rest from the
 *   ORIGINAL index, suffixing until unused (never colliding with a valid id).
 * - repaired = any rule normalized, dropped, or id-repaired (persist once).
 */
export function parseSignals(
	raw: unknown,
	warnings: string[]
): { rules: SignalRule[]; repaired: boolean } {
	if (raw === undefined) return { rules: [], repaired: false };
	if (!Array.isArray(raw)) {
		warnings.push('Wayfinder: signals was not an array; ignoring.');
		return { rules: [], repaired: true };
	}
	const survivors: { rule: SignalRule; originalIndex: number }[] = [];
	let anyChanged = false;
	raw.forEach((entry, i) => {
		const coerced = coerceRawRule(entry);
		const norm = coerced ? normalizeSignalRule(coerced) : null;
		if (!norm) {
			warnings.push(`Wayfinder: dropped invalid signal rule at index ${i}.`);
			return;
		}
		if (norm.changed) anyChanged = true;
		survivors.push({ rule: norm.rule, originalIndex: i });
	});

	let repaired = anyChanged || survivors.length !== raw.length;
	const finalIds: (string | null)[] = survivors.map(() => null);
	const reserved = new Set<string>();
	survivors.forEach((s, idx) => {
		const id = s.rule.id;
		if (id !== '' && id.length <= SIGNAL_LIMITS.idMax && !reserved.has(id)) {
			reserved.add(id);
			finalIds[idx] = id;
		}
	});
	survivors.forEach((s, idx) => {
		if (finalIds[idx] != null) return;
		repaired = true;
		let candidate = `wf-signal-${s.originalIndex}`;
		let n = 1;
		while (reserved.has(candidate)) candidate = `wf-signal-${s.originalIndex}-${n++}`;
		reserved.add(candidate);
		finalIds[idx] = candidate;
	});
	const rules = survivors.map((s, idx) => ({ ...s.rule, id: finalIds[idx] as string }));
	return { rules, repaired };
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
		return { data: defaultData(), warnings, recovered: false, signalsRepaired: false };
	}
	if (!isRecord(raw)) {
		warnings.push('Wayfinder: stored data was not an object; using defaults.');
		return { data: defaultData(), warnings, recovered: true, signalsRepaired: false };
	}
	if ('version' in raw && raw.version !== SCHEMA_VERSION) {
		warnings.push(`Wayfinder: unknown data version ${String(raw.version)}; using defaults.`);
		return { data: defaultData(), warnings, recovered: true, signalsRepaired: false };
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

	const signalsResult = parseSignals(raw.signals, warnings);
	data.signals = signalsResult.rules;

	return { data, warnings, recovered: false, signalsRepaired: signalsResult.repaired };
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
		// Normalize repaired signal ids / dropped rules on disk once (no subscribers yet).
		if (result.signalsRepaired) this.commit();
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

	/** Set or clear (null) an explicit icon color. */
	setIconColor(kind: 'folder' | 'file', path: string, color: string | null): boolean {
		const p = normalizePath(path);
		if (p === null) return false;
		if (color !== null && !HEX_COLOR_RE.test(color)) return false;
		if (kind === 'folder') {
			const prev = this.data.folders[p];
			const next: FolderEntry = { ...prev };
			if (color === null) {
				if (!prev || !('iconColor' in prev)) return false;
				delete next.iconColor;
			} else next.iconColor = color.toLowerCase();
			return this.putFolder(p, next);
		}
		const prev = this.data.files[p];
		const next: FileEntry = { ...prev };
		if (color === null) {
			if (!prev || !('iconColor' in prev)) return false;
			delete next.iconColor;
		} else next.iconColor = color.toLowerCase();
		const files = { ...this.data.files };
		if (Object.keys(next).length === 0) delete files[p];
		else files[p] = next;
		this.data = { ...this.data, files };
		this.commit();
		return true;
	}

	/** Remove every rule for exactly this folder (descendants untouched). */
	clearFolder(path: string): boolean {
		const p = normalizePath(path);
		if (p === null || !(p in this.data.folders)) return false;
		const folders = { ...this.data.folders };
		delete folders[p];
		this.data = { ...this.data, folders };
		this.commit();
		return true;
	}

	/** Set or clear (null) the default icon for folders in this subtree. */
	setChildIcon(path: string, icon: string | null): boolean {
		const p = normalizePath(path);
		if (p === null) return false;
		const prev = this.data.folders[p];
		const next: FolderEntry = { ...prev };
		if (icon === null) {
			if (!prev || !('childIcon' in prev)) return false;
			delete next.childIcon;
		} else {
			const i = icon.trim();
			if (i === '') return false;
			next.childIcon = i;
		}
		return this.putFolder(p, next);
	}

	/** Toggle whether this folder's subtree is excluded from task counts. */
	setExcludeTaskCount(path: string, exclude: boolean): boolean {
		const p = normalizePath(path);
		if (p === null) return false;
		const prev = this.data.folders[p];
		const next: FolderEntry = { ...prev };
		if (exclude) next.excludeTaskCount = true;
		else {
			if (!prev || !('excludeTaskCount' in prev)) return false;
			delete next.excludeTaskCount;
		}
		return this.putFolder(p, next);
	}

	/** Set or clear (null) how this folder's subfolders derive colors. */
	setChildColors(path: string, scheme: ChildColorScheme | null): boolean {
		const p = normalizePath(path);
		if (p === null) return false;
		const prev = this.data.folders[p];
		const next: FolderEntry = { ...prev };
		if (scheme === null) {
			if (!prev || !('childColors' in prev)) return false;
			delete next.childColors;
		} else {
			next.childColors = scheme;
		}
		return this.putFolder(p, next);
	}

	/** Set or clear (null) the folder's emphasis level. */
	setFolderEmphasis(path: string, emphasis: Emphasis | null): boolean {
		const p = normalizePath(path);
		if (p === null) return false;
		const prev = this.data.folders[p];
		const next: FolderEntry = { ...prev };
		if (emphasis === null) {
			if (!prev || !('emphasis' in prev)) return false;
			delete next.emphasis;
		} else {
			next.emphasis = emphasis;
		}
		return this.putFolder(p, next);
	}

	setFolderCountBadge(path: string, on: boolean): boolean {
		const p = normalizePath(path);
		if (p === null) return false;
		const prev = this.data.folders[p];
		const next: FolderEntry = { ...prev };
		if (on) next.countBadge = true;
		else {
			if (!prev?.countBadge) return false;
			delete next.countBadge;
		}
		return this.putFolder(p, next);
	}

	/** Merge a preset entry into a folder (used by the PARA command). */
	applyPresetEntry(path: string, entry: FolderEntry): boolean {
		const p = normalizePath(path);
		if (p === null) return false;
		return this.putFolder(p, { ...this.data.folders[p], ...entry });
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

	// --- signal rules -----------------------------------------------------

	private setSignals(next: SignalRule[]): boolean {
		if (signalRulesEqual(this.data.signals, next)) return false;
		this.data = { ...this.data, signals: next };
		this.commit();
		return true;
	}

	/** Append a rule; rejects invalid rules and duplicate ids. */
	addSignalRule(rule: SignalRule): boolean {
		const norm = normalizeSignalRule(rule);
		if (!norm) return false;
		if (this.data.signals.some((r) => r.id === norm.rule.id)) return false;
		return this.setSignals([...this.data.signals, norm.rule]);
	}

	/** Patch a rule by id (id is immutable); rejects a patch that invalidates it. */
	updateSignalRule(id: string, patch: Partial<Omit<SignalRule, 'id'>>): boolean {
		const idx = this.data.signals.findIndex((r) => r.id === id);
		if (idx < 0) return false;
		const existing = this.data.signals[idx];
		if (!existing) return false;
		const norm = normalizeSignalRule({ ...existing, ...patch, id });
		if (!norm) return false;
		const next = this.data.signals.slice();
		next[idx] = norm.rule;
		return this.setSignals(next);
	}

	moveSignalRule(id: string, direction: -1 | 1): boolean {
		const i = this.data.signals.findIndex((r) => r.id === id);
		if (i < 0) return false;
		const j = i + direction;
		if (j < 0 || j >= this.data.signals.length) return false;
		const next = this.data.signals.slice();
		const a = next[i];
		const b = next[j];
		if (!a || !b) return false;
		next[i] = b;
		next[j] = a;
		return this.setSignals(next);
	}

	duplicateSignalRule(id: string, newId: string): boolean {
		const i = this.data.signals.findIndex((r) => r.id === id);
		if (i < 0) return false;
		const source = this.data.signals[i];
		if (!source) return false;
		if (this.data.signals.some((r) => r.id === newId)) return false;
		const norm = normalizeSignalRule({ ...source, id: newId });
		if (!norm) return false;
		const next = this.data.signals.slice();
		next.splice(i + 1, 0, norm.rule);
		return this.setSignals(next);
	}

	removeSignalRule(id: string): boolean {
		const next = this.data.signals.filter((r) => r.id !== id);
		if (next.length === this.data.signals.length) return false;
		return this.setSignals(next);
	}

	setSignalRuleEnabled(id: string, enabled: boolean): boolean {
		return this.updateSignalRule(id, { enabled });
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
