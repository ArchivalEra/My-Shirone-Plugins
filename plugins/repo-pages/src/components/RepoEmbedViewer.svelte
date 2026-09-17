<script lang="ts">
	/**
	 * @shirone-plugins/repo-pages
	 * RepoEmbedViewer: Material 3 Expressive embedded viewer for repository pages.
	 */

	interface Props {
		repoName: string;
		title?: string;
		domesticUrl?: string;
		githubUrl?: string;
		onClose?: () => void;
	}

	let {
		repoName,
		title = repoName,
		domesticUrl = `https://isui.ren/repo/${repoName}/`,
		githubUrl = `https://github.com/ArchivalEra/${repoName}`,
		onClose,
	}: Props = $props();

	let isFullscreen = $state(false);

	function toggleFullscreen() {
		isFullscreen = !isFullscreen;
	}
</script>

<div
	class="repo-embed-container"
	class:fullscreen={isFullscreen}
	role="region"
	aria-label="Repository preview: {title}"
>
	<!-- M3E Expressive Header Bar -->
	<div class="repo-embed-header">
		<div class="repo-embed-info">
			<span class="repo-badge-speed" title="EdgeOne 国内直连加速节点">
				<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
					<path d="M7 2v11h3v9l7-12h-4l4-8z" />
				</svg>
				国内加速镜像
			</span>
			<span class="repo-title">{title}</span>
			<span class="repo-path">isui.ren/repo/{repoName}/</span>
		</div>

		<div class="repo-embed-actions">
			<a
				href={domesticUrl}
				target="_blank"
				rel="noopener noreferrer"
				class="repo-action-btn"
				title="在新标签页中打开国内加速页面"
			>
				<span>新窗口</span>
				<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
					<polyline points="15 3 21 3 21 9" />
					<line x1="10" y1="14" x2="21" y2="3" />
				</svg>
			</a>

			<a
				href={githubUrl}
				target="_blank"
				rel="noopener noreferrer"
				class="repo-action-btn secondary"
				title="查看 GitHub 原仓库"
			>
				<span>GitHub</span>
			</a>

			<button
				type="button"
				class="repo-action-btn icon"
				onclick={toggleFullscreen}
				aria-label={isFullscreen ? "退出全屏" : "全屏查看"}
				title={isFullscreen ? "退出全屏" : "全屏查看"}
			>
				{#if isFullscreen}
					<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
					</svg>
				{:else}
					<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
					</svg>
				{/if}
			</button>

			{#if onClose}
				<button
					type="button"
					class="repo-action-btn icon close"
					onclick={onClose}
					aria-label="关闭预览"
					title="关闭预览"
				>
					<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="18" y1="6" x2="6" y2="18" />
						<line x1="6" y1="6" x2="18" y2="18" />
					</svg>
				</button>
			{/if}
		</div>
	</div>

	<!-- Embedded Sandbox Frame -->
	<div class="repo-embed-frame-wrap">
		<iframe
			src={domesticUrl}
			title="{title} 仓库预览"
			class="repo-iframe"
			loading="lazy"
			sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
		></iframe>
	</div>
</div>

<style>
	.repo-embed-container {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 600px;
		background: var(--surface-container-lowest, #121316);
		border: 1px solid var(--outline-variant, rgba(255, 255, 255, 0.1));
		border-radius: var(--shape-corner-large, 16px);
		overflow: hidden;
		transition: all 0.25s cubic-bezier(0.2, 0, 0, 1);
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
	}

	.repo-embed-container.fullscreen {
		position: fixed;
		inset: 0;
		width: 100vw;
		height: 100vh;
		z-index: 9999;
		border-radius: 0;
		border: none;
	}

	.repo-embed-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 16px;
		background: var(--surface-container, #1e1f23);
		border-bottom: 1px solid var(--outline-variant, rgba(255, 255, 255, 0.08));
		gap: 12px;
		user-select: none;
	}

	.repo-embed-info {
		display: flex;
		align-items: center;
		gap: 10px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.repo-badge-speed {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 8px;
		border-radius: var(--shape-corner-full, 999px);
		background: rgba(34, 197, 94, 0.12);
		color: #4ade80;
		font-size: 11px;
		font-weight: 600;
	}

	.repo-title {
		font-weight: 600;
		font-size: 14px;
		color: var(--on-surface, #e2e2e6);
	}

	.repo-path {
		font-size: 12px;
		color: var(--on-surface-variant, #8f9099);
		font-family: monospace;
	}

	.repo-embed-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.repo-action-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		border-radius: var(--shape-corner-small, 8px);
		background: var(--surface-container-high, #28292e);
		color: var(--on-surface, #e2e2e6);
		font-size: 12px;
		text-decoration: none;
		border: 1px solid var(--outline-variant, rgba(255, 255, 255, 0.1));
		cursor: pointer;
		transition: background 0.15s, border-color 0.15s;
	}

	.repo-action-btn:hover {
		background: var(--surface-container-highest, #33343a);
		border-color: var(--primary, #80b3ff);
	}

	.repo-action-btn.icon {
		padding: 6px;
	}

	.repo-action-btn.close:hover {
		background: rgba(239, 68, 68, 0.2);
		color: #f87171;
		border-color: #ef4444;
	}

	.repo-embed-frame-wrap {
		flex: 1;
		width: 100%;
		height: 100%;
		position: relative;
		background: #ffffff;
	}

	.repo-iframe {
		width: 100%;
		height: 100%;
		border: none;
	}

	@media (max-width: 640px) {
		.repo-path {
			display: none;
		}
	}
</style>
