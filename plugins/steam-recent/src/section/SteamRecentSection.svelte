<script lang="ts">
	/**
	 * Steam「最近在玩」展示块：纯 SSR 组件（构建期快照平面）。
	 * 数据在构建期由 cli/steam-sync.mjs 落盘、页面钩子读入后经 props 传入；
	 * 不挂 client: 指令——零客户端 JS、零运行时请求。
	 * 文案内联于插件（与 what-im-doing 胶囊同惯例），不经主题 i18n。
	 */
	import GameRecentCard from "./GameRecentCard.svelte";
	import type { RecentGameItem, SteamRecentOptions } from "../types";

	let {
		options,
		games = [] as RecentGameItem[],
	}: {
		options: SteamRecentOptions;
		games?: RecentGameItem[];
	} = $props();

	const capped = $derived(games.slice(0, options.maxItems));
</script>

{#if options.enable}
	<section class="steam-recent" aria-label={options.title}>
		<header class="steam-recent__header">
			<span class="steam-recent__accent" aria-hidden="true"></span>
			<h2 class="steam-recent__title">{options.title}</h2>
		</header>
		{#if capped.length}
			<div class="steam-recent__grid">
				{#each capped as game (game.appid)}
					<GameRecentCard {game} />
				{/each}
			</div>
		{:else}
			<p class="steam-recent__state" role="status">{options.emptyLabel}</p>
		{/if}
	</section>
{/if}

<style lang="stylus">
.steam-recent
	margin: 8px 0 28px

	&__header
		display: flex
		align-items: center
		gap: 10px
		margin-bottom: 14px

	&__accent
		width: 3px
		height: 1.1em
		border-radius: 999px
		background: var(--primary)

	&__title
		margin: 0
		font: var(--m3e-type-title-large)
		color: var(--on-surface)

	&__grid
		display: grid
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr))
		gap: 14px

	&__state
		margin: 0
		display: flex
		align-items: center
		font: var(--m3e-type-body-medium)
		color: var(--on-surface-variant)
</style>
