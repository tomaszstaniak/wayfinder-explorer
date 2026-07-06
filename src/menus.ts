import { App, Menu, MenuItem, TAbstractFile, TFile, TFolder } from 'obsidian';
import { ChildColorScheme } from './types';
import { ColorPickerModal } from './color-picker';
import { IconPickerModal } from './icon-picker';
import { IconSource } from './icons';
import { Store } from './store';

/**
 * setSubmenu exists at runtime but is not in the public typings.
 * When unavailable, items fall back onto the parent menu with a
 * "Wayfinder: " title prefix.
 */
interface MenuItemWithSubmenu extends MenuItem {
	setSubmenu(): Menu;
}

function hasSubmenu(item: MenuItem): item is MenuItemWithSubmenu {
	return typeof (item as Partial<MenuItemWithSubmenu>).setSubmenu === 'function';
}

export const PRESET_COLORS: ReadonlyArray<{ name: string; value: string }> = [
	{ name: 'Red', value: '#d96666' },
	{ name: 'Orange', value: '#d98d4d' },
	{ name: 'Yellow', value: '#c2a52e' },
	{ name: 'Green', value: '#5cab5c' },
	{ name: 'Teal', value: '#3fa8a0' },
	{ name: 'Blue', value: '#5c8fd9' },
	{ name: 'Purple', value: '#9673d9' },
	{ name: 'Pink', value: '#d973b3' },
];

function swatchTitle(prefix: string, name: string, color: string): DocumentFragment {
	return createFragment((frag) => {
		const dot = frag.createSpan({ cls: 'wayfinder-swatch' });
		dot.style.backgroundColor = color;
		frag.appendText(prefix + name);
	});
}

export interface MenuContext {
	app: App;
	store: Store;
	iconSource: IconSource;
}

/** True when the nearest ancestor with an emphasis setting says 'dim'. */
function isUnderDimScope(store: Store, path: string): boolean {
	const parts = path.split('/');
	for (let i = parts.length - 1; i > 0; i--) {
		const ancestor = parts.slice(0, i).join('/');
		const emphasis = store.state.folders[ancestor]?.emphasis;
		if (emphasis) return emphasis === 'dim';
	}
	return false;
}

/** Adds the Wayfinder submenu to the explorer's file context menu. */
export function addWayfinderMenu(menu: Menu, target: TAbstractFile, ctx: MenuContext): void {
	const isFolder = target instanceof TFolder;
	const isFile = target instanceof TFile;
	if (!isFolder && !isFile) return;

	let sub: Menu = menu;
	let prefix = 'Wayfinder: ';
	menu.addItem((item) => {
		if (hasSubmenu(item)) {
			item.setTitle('Wayfinder').setIcon('compass');
			sub = item.setSubmenu();
			prefix = '';
		} else {
			item.setTitle('Wayfinder (options below)').setIcon('compass').setDisabled(true);
		}
	});
	buildItems(sub, prefix, target, isFolder, ctx);
}

function buildItems(
	sub: Menu,
	prefix: string,
	target: TAbstractFile,
	isFolder: boolean,
	ctx: MenuContext
): void {
	const entry = isFolder ? ctx.store.state.folders[target.path] : ctx.store.state.files[target.path];

	sub.addItem((i: MenuItem) =>
		i
			.setTitle(prefix + 'Set icon…')
			.setIcon('image-plus')
			.onClick(() => {
				new IconPickerModal(ctx.app, ctx.iconSource.ids(), (iconId) => {
					if (isFolder) ctx.store.setFolderIcon(target.path, iconId);
					else ctx.store.setFileIcon(target.path, iconId);
				}).open();
			})
	);
	if (entry?.icon) {
		sub.addItem((i: MenuItem) =>
			i
				.setTitle(prefix + 'Remove icon')
				.setIcon('image-off')
				.onClick(() => {
					if (isFolder) ctx.store.removeFolderIcon(target.path);
					else ctx.store.removeFileIcon(target.path);
				})
		);
	}

	if (!isFolder) return;
	const folderEntry = ctx.store.state.folders[target.path];
	const localColor = folderEntry && 'color' in folderEntry ? folderEntry.color : undefined;

	sub.addSeparator();
	for (const preset of PRESET_COLORS) {
		sub.addItem((i: MenuItem) => {
			i.setTitle(swatchTitle(prefix, preset.name, preset.value)).onClick(() => {
				ctx.store.setFolderColor(target.path, preset.value);
			});
			if (localColor === preset.value) i.setChecked(true);
		});
	}
	sub.addItem((i: MenuItem) =>
		i
			.setTitle(prefix + 'Custom color…')
			.setIcon('palette')
			.onClick(() => {
				new ColorPickerModal(
					ctx.app,
					typeof localColor === 'string' ? localColor : null,
					(color) => {
						ctx.store.setFolderColor(target.path, color);
					}
				).open();
			})
	);

	if (typeof localColor === 'string') {
		const schemes: Array<{ value: ChildColorScheme | null; label: string }> = [
			{ value: null, label: 'Subfolders: same color' },
			{ value: 'shades', label: 'Subfolders: shades' },
			{ value: 'analogous', label: 'Subfolders: analogous hues' },
			{ value: 'spread', label: 'Subfolders: color spread' },
		];
		const current = folderEntry?.childColors ?? null;
		for (const scheme of schemes) {
			sub.addItem((i: MenuItem) => {
				i.setTitle(prefix + scheme.label).onClick(() => {
					ctx.store.setChildColors(target.path, scheme.value);
				});
				if (current === scheme.value) i.setChecked(true);
			});
		}
	}

	sub.addSeparator();
	const localEmphasis = folderEntry?.emphasis;
	if (localEmphasis === 'dim') {
		sub.addItem((i: MenuItem) =>
			i
				.setTitle(prefix + 'Remove dimming')
				.setIcon('sun')
				.onClick(() => {
					ctx.store.setFolderEmphasis(target.path, null);
				})
		);
	} else {
		sub.addItem((i: MenuItem) =>
			i
				.setTitle(prefix + 'Dim (archive style)')
				.setIcon('moon')
				.onClick(() => {
					ctx.store.setFolderEmphasis(target.path, 'dim');
				})
		);
		if (localEmphasis === 'normal') {
			sub.addItem((i: MenuItem) =>
				i
					.setTitle(prefix + 'Remove keep-normal')
					.setIcon('rotate-ccw')
					.onClick(() => {
						ctx.store.setFolderEmphasis(target.path, null);
					})
			);
		} else if (isUnderDimScope(ctx.store, target.path)) {
			sub.addItem((i: MenuItem) =>
				i
					.setTitle(prefix + 'Keep normal (undim this subtree)')
					.setIcon('sun')
					.onClick(() => {
						ctx.store.setFolderEmphasis(target.path, 'normal');
					})
			);
		}
	}
	sub.addItem((i: MenuItem) =>
		i
			.setTitle(
				prefix + (folderEntry?.countBadge ? 'Remove count badge' : 'Count badge when non-empty')
			)
			.setIcon('bell')
			.onClick(() => {
				ctx.store.setFolderCountBadge(target.path, !folderEntry?.countBadge);
			})
	);

	sub.addSeparator();
	if (localColor !== undefined) {
		sub.addItem((i: MenuItem) =>
			i
				.setTitle(prefix + 'Inherit color')
				.setIcon('rotate-ccw')
				.onClick(() => {
					ctx.store.inheritFolderColor(target.path);
				})
		);
	}
	if (localColor !== null) {
		sub.addItem((i: MenuItem) =>
			i
				.setTitle(prefix + 'No color for this subtree')
				.setIcon('ban')
				.onClick(() => {
					ctx.store.setFolderColor(target.path, null);
				})
		);
	}
}
