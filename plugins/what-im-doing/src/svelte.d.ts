declare module "*.svelte" {
	import type { Component } from "svelte";
	const component: any;
	export default component;
}

declare module "svelte" {
	export type Component<T = any> = any;
	export function mount(
		component: any,
		options: { target: Element | Document | ShadowRoot; props?: Record<string, any> },
	): any;
	export function unmount(instance: any): void;
	export function onMount(fn: () => any): void;
	export function onDestroy(fn: () => any): void;
}
