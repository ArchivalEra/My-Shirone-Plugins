<script lang="ts">
	/**
	 * 最近游玩卡片：紧凑横屏卡——封面、游戏名、近两周时长，整卡外链
	 * Steam 商店页。纯 SSR 组件（零客户端 JS）。
	 *
	 * 封面走 background-image 双层（URL 层 + 渐变底层）：URL 404 时该层
	 * 不绘制、渐变直接可见——background 天生无破图元素，无需任何 JS 回退；
	 * 游戏名在卡片正文里有真实文本，装饰性封面不计 alt。
	 */
	import type { RecentGameItem } from "../types";

	let { game }: { game: RecentGameItem } = $props();

	const storeUrl = $derived(
		`https://store.steampowered.com/app/${game.appid}/`,
	);
	const hoursLabel = $derived(
		game.hours2weeks === undefined
			? ""
			: `近两周游玩 ${game.hours2weeks.toFixed(1)} 小时`,
	);
	const coverStyle = $derived(
		game.cover ? `background-image: url("${game.cover}")` : undefined,
	);
</script>

<a
	class="game-recent-card"
	href={storeUrl}
	target="_blank"
	rel="noopener noreferrer"
>
	<div
		class="game-recent-card__banner"
		style={coverStyle}
		role="img"
		aria-label={game.name}
	></div>
	<div class="game-recent-card__body">
		<span class="game-recent-card__name">{game.name}</span>
		{#if hoursLabel}
			<span class="game-recent-card__hours">{hoursLabel}</span>
		{/if}
	</div>
</a>

<style lang="stylus">
.game-recent-card
	display: flex
	flex-direction: column
	overflow: hidden
	background: var(--card-bg)
	border: 1px solid var(--outline-variant)
	border-radius: var(--shape-corner-l)
	text-decoration: none
	transition:
		border-color var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate),
		box-shadow var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate),
		transform var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate)

	&:hover
		border-color: var(--outline)
		box-shadow: var(--m3e-elevation-2)
		transform: translateY(-2px)

	/* 封面：内联 style 提供 url() 层，这里补尺寸；渐变作为 ::before 底层 */
	&__banner
		position: relative
		display: flex
		align-items: center
		justify-content: center
		width: 100%
		aspect-ratio: 16 / 9
		flex-shrink: 0
		overflow: hidden
		background-color: var(--surface-container-high)
		background-size: cover
		background-position: center
		background-repeat: no-repeat

		&::before
			content: ""
			position: absolute
			inset: 0
			z-index: -1
			background: linear-gradient(150deg,
				unquote("color-mix(in oklab, var(--tertiary) 14%, var(--surface-container-low))"),
				var(--surface-container-high))

		.game-recent-card:hover &
			filter: brightness(1.05)

	&__body
		display: flex
		flex-direction: column
		gap: 2px
		padding: 10px 12px 12px

	&__name
		font: var(--m3e-type-title-medium)
		color: var(--on-surface)
		overflow: hidden
		text-overflow: ellipsis
		white-space: nowrap

	&__hours
		font: var(--m3e-type-label-medium)
		color: var(--on-surface-variant)
</style>
