declare module "*.svelte" {
	const component: unknown;
	export default component;
}

declare module "svelte" {
	export type Component<T = Record<string, unknown>> = unknown;
	export function mount(
		component: unknown,
		options: {
			target: Element | Document | ShadowRoot;
			props?: Record<string, unknown>;
		},
	): unknown;
	export function unmount(instance: unknown): void;
	export function onMount(fn: () => unknown): void;
	export function onDestroy(fn: () => unknown): void;
}
