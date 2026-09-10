/**
 * Polyfill mock environment for Node.js unit testing of Pretext Masonry.
 */

if (typeof globalThis.OffscreenCanvas === "undefined") {
	globalThis.OffscreenCanvas = class {
		constructor(width, height) {
			this.width = width;
			this.height = height;
		}
		getContext(type) {
			if (type === "2d") {
				return {
					measureText: (text) => {
						let w = 0;
						for (const char of text) {
							w += char.charCodeAt(0) > 255 ? 14 : 8;
						}
						return { width: w };
					},
					font: "",
				};
			}
			return null;
		}
	};
}

class MockDOMTokenList {
	constructor() {
		this._set = new Set();
	}
	add(...tokens) {
		for (const t of tokens) this._set.add(t);
	}
	remove(...tokens) {
		for (const t of tokens) this._set.delete(t);
	}
	contains(token) {
		return this._set.has(token);
	}
	has(token) {
		return this._set.has(token);
	}
}

class MockHTMLElement {
	constructor(tagName) {
		this.tagName = tagName.toUpperCase();
		this.classList = new MockDOMTokenList();
		this.dataset = {};
		this.style = {};
		this.children = [];
		this.childNodes = [];
		this.parentElement = null;
		this._attributes = new Map();
		this.isConnected = true;
		this._offsetHeight = 0;
	}

	get offsetHeight() {
		return this._offsetHeight;
	}

	set offsetHeight(val) {
		this._offsetHeight = val;
	}

	setAttribute(name, val) {
		this._attributes.set(name, String(val));
		if (name.startsWith("data-")) {
			const key = name
				.slice(5)
				.replace(/-([a-z])/g, (_, l) => l.toUpperCase());
			this.dataset[key] = String(val);
		}
	}

	getAttribute(name) {
		return this._attributes.get(name) ?? null;
	}

	appendChild(child) {
		child.parentElement = this;
		this.children.push(child);
		this.childNodes.push(child);
		return child;
	}

	appendTextNode(text) {
		const node = {
			nodeType: 3, // Node.TEXT_NODE
			textContent: text,
			parentElement: this,
		};
		this.childNodes.push(node);
		return node;
	}

	querySelector(selector) {
		const parts = selector.split(",").map((s) => s.trim());
		for (const child of this.children) {
			for (const part of parts) {
				if (part.startsWith(".")) {
					const cls = part.slice(1);
					if (child.classList.contains(cls)) return child;
				} else if (child.tagName.toLowerCase() === part.toLowerCase()) {
					return child;
				}
			}
			const found = child.querySelector(selector);
			if (found) return found;
		}
		return null;
	}

	querySelectorAll(selector) {
		const results = [];
		const parts = selector.split(",").map((s) => s.trim());
		for (const child of this.children) {
			for (const part of parts) {
				if (part.startsWith(".")) {
					const cls = part.slice(1);
					if (child.classList.contains(cls)) {
						results.push(child);
						break;
					}
				}
			}
			results.push(...child.querySelectorAll(selector));
		}
		return results;
	}

	get textContent() {
		let text = "";
		for (const node of this.childNodes) {
			if (node.nodeType === 3) {
				text += node.textContent;
			} else if (node.textContent) {
				text += node.textContent;
			}
		}
		return text;
	}

	set textContent(val) {
		this.childNodes = [];
		this.children = [];
		this.appendTextNode(val);
	}
}

if (typeof globalThis.document === "undefined") {
	globalThis.document = {
		createElement: (tag) => new MockHTMLElement(tag),
		documentElement: new MockHTMLElement("html"),
		body: new MockHTMLElement("body"),
		fonts: {
			ready: Promise.resolve(),
		},
	};
}

if (typeof globalThis.getComputedStyle === "undefined") {
	globalThis.getComputedStyle = (el) => {
		return {
			gridTemplateColumns: el.dataset?.testGridCols ?? "320px 320px",
			gridColumnEnd: el.style?.gridColumnEnd ?? "",
			getPropertyValue: (prop) => (prop === "--font-sans" ? "Inter" : ""),
		};
	};
}

if (typeof globalThis.window === "undefined") {
	globalThis.window = {
		getComputedStyle: globalThis.getComputedStyle,
		location: { pathname: "/" },
	};
}

export { MockHTMLElement };
