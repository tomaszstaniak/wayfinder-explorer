/**
 * Pure helpers for counting open tasks per folder. The plugin reads task
 * statuses from Obsidian's metadata cache; these functions turn that into
 * a folder→count map. Kept separate and pure so they can be unit-tested.
 */

/**
 * "Open" = needs attention: todo (space) or in-progress ('/').
 * Done ('x'/'X') and cancelled ('-') do not count.
 */
export function isOpenTaskStatus(status: string): boolean {
	return status === ' ' || status === '/';
}

/**
 * Count open task lines in raw markdown. Matches only real checkboxes
 * (`- [ ]`, `* [/]`, `+ [ ]`, indented), NOT plain bullets — Obsidian's
 * metadata task field is unreliable for this, so we read the text.
 */
export function countOpenTasksInText(text: string): number {
	const re = /^[ \t]*[-*+] \[([ /])\] /gm;
	let n = 0;
	while (re.exec(text) !== null) n++;
	return n;
}

/**
 * Sum per-file open-task counts into every ancestor folder. A file with
 * N open tasks adds N to each folder on its path. Files with zero are
 * skipped, so only folders that actually contain open tasks appear.
 */
export function rollUpToFolders(
	fileTaskCounts: ReadonlyMap<string, number>
): Map<string, number> {
	const folders = new Map<string, number>();
	for (const [path, count] of fileTaskCounts) {
		if (count <= 0) continue;
		const parts = path.split('/');
		for (let i = 1; i < parts.length; i++) {
			const folder = parts.slice(0, i).join('/');
			folders.set(folder, (folders.get(folder) ?? 0) + count);
		}
	}
	return folders;
}
