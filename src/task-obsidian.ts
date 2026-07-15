import { App, MarkdownView, TFile } from 'obsidian';

/** An open Markdown editor for `path`, regardless of which view is focused. */
export function markdownViewForPath(app: App, path: string): MarkdownView | null {
	for (const leaf of app.workspace.getLeavesOfType('markdown')) {
		const view = leaf.view;
		if (view instanceof MarkdownView && view.file?.path === path) return view;
	}
	return null;
}

/** Open/reveal `file` in a Markdown leaf (never a sidebar pane) and land on `line`. */
export async function openTaskLocation(app: App, file: TFile, line: number): Promise<void> {
	const ws = app.workspace;
	const leaf = markdownViewForPath(app, file.path)?.leaf ?? ws.getLeaf('tab');
	await leaf.openFile(file, { eState: { line } });
	await ws.revealLeaf(leaf);
	// `eState` scroll is ignored when the file was already open, so set the cursor
	// explicitly — this guarantees the view lands on the task line.
	const view = leaf.view;
	if (view instanceof MarkdownView) {
		const { editor } = view;
		const target = Math.max(0, Math.min(line, editor.lineCount() - 1));
		const pos = { line: target, ch: 0 };
		editor.setCursor(pos);
		editor.scrollIntoView({ from: pos, to: pos }, true);
	}
}
