import { FolderEntry } from './types';

/**
 * PARA preset: detects PARA-style root folders by name and produces
 * ordinary Wayfinder folder entries for them. Everything here is pure
 * data — reversible, inspectable, editable through the normal menus.
 *
 * Colors follow the actionability gradient: the more actionable the
 * category, the more saturated its color. Archive is dimmed entirely.
 */

export type ParaRole = 'inbox' | 'projects' | 'areas' | 'resources' | 'archive';

export const PARA_ROLES: readonly ParaRole[] = [
	'inbox',
	'projects',
	'areas',
	'resources',
	'archive',
];

/** Loose name matching: "01 Projects", "Projects", "1. project", … */
const PARA_MATCHERS: Record<ParaRole, RegExp> = {
	inbox: /\binbox\b/i,
	projects: /\bprojects?\b/i,
	areas: /\bareas?\b/i,
	resources: /\bresources?\b/i,
	archive: /\barchiv/i, // archive, archives, archived, archiv (de)
};

export const PARA_STYLE: Record<ParaRole, FolderEntry> = {
	inbox: { color: '#b8963e', icon: 'inbox', countBadge: true },
	projects: { color: '#d96a4b', icon: 'target' }, // full saturation: most actionable
	areas: { color: '#6b9e58', icon: 'layers' }, // medium
	resources: { color: '#64808f', icon: 'library' }, // low
	archive: { color: null, icon: 'archive', emphasis: 'dim' }, // out of the way
};

/**
 * Map each role to the first matching root folder name.
 * A folder claimed by one role is not offered to another; roles are
 * checked in PARA order so "Project Archive" style names resolve sanely.
 */
export function detectParaRoots(
	rootFolderPaths: readonly string[]
): Partial<Record<ParaRole, string>> {
	const result: Partial<Record<ParaRole, string>> = {};
	const claimed = new Set<string>();
	for (const role of PARA_ROLES) {
		for (const path of rootFolderPaths) {
			if (claimed.has(path)) continue;
			if (PARA_MATCHERS[role].test(path)) {
				result[role] = path;
				claimed.add(path);
				break;
			}
		}
	}
	return result;
}

export interface ParaAssignment {
	role: ParaRole;
	path: string;
	entry: FolderEntry;
}

export function paraAssignments(
	roots: Partial<Record<ParaRole, string>>
): ParaAssignment[] {
	const out: ParaAssignment[] = [];
	for (const role of PARA_ROLES) {
		const path = roots[role];
		if (path) out.push({ role, path, entry: { ...PARA_STYLE[role] } });
	}
	return out;
}
