/**
 * Owns Wayfinder's single <style data-wayfinder> element.
 * The rest of the plugin never touches the DOM.
 */
export class StyleManager {
	private el: HTMLStyleElement | null = null;

	constructor(private readonly doc: Document) {}

	mount(): void {
		if (this.el) return;
		this.el = this.doc.createElement('style');
		this.el.setAttribute('data-wayfinder', '');
		this.doc.head.appendChild(this.el);
	}

	setCss(css: string): void {
		if (!this.el) return;
		this.el.textContent = css;
	}

	unmount(): void {
		this.el?.remove();
		this.el = null;
	}
}
