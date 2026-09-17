#!/usr/bin/env node
/**
 * @shirone-plugins/repo-pages CLI
 * Automated GitHub Pages manager & domestic EdgeOne mirror generator.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_OWNER = "ArchivalEra";
const DEFAULT_DOMAIN = "isui.ren";

function runGh(args, options = {}) {
	try {
		const stdout = execSync(`gh ${args}`, {
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
			...options,
		});
		return stdout.trim();
	} catch (err) {
		if (options.throwOnError) {
			throw err;
		}
		return null;
	}
}

function printUsage() {
	console.log(`
@shirone-plugins/repo-pages CLI Tool
Manage GitHub Pages across repositories and synchronize domestic EdgeOne mirrors.

Usage:
  shirone-repo-pages inspect [options]      Scan repos and report GitHub Pages status
  shirone-repo-pages enable <repo> [opts]   Enable GitHub Pages for a specific repository
  shirone-repo-pages sync [options]         Export Pages-enabled repos to Shirone projects format
  shirone-repo-pages --help                 Show this help message

Options:
  --owner <user>      GitHub user/org name (default: "${DEFAULT_OWNER}")
  --branch <branch>   Git branch for Pages source (default: "main" or "gh-pages")
  --path <path>       Directory path for Pages ("/docs" or "/", default: "/docs" or "/")
  --json              Output raw JSON instead of table
`);
}

function parseArgs() {
	const args = process.argv.slice(2);
	const command = args[0] || "help";
	const flags = {};
	let repoArg = null;

	for (let i = 1; i < args.length; i++) {
		const arg = args[i];
		if (arg.startsWith("--")) {
			const key = arg.slice(2);
			if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
				flags[key] = args[i + 1];
				i++;
			} else {
				flags[key] = true;
			}
		} else if (!repoArg) {
			repoArg = arg;
		}
	}

	return { command, repoArg, flags };
}

async function inspectCommand(owner, asJson) {
	console.log(`🔍 Scanning repositories for GitHub user: ${owner}...`);
	const repoListRaw = runGh(
		`repo list ${owner} --limit 50 --json name,isPrivate,description,url`,
	);

	if (!repoListRaw) {
		console.error("❌ Failed to query repositories with gh CLI. Is gh authenticated?");
		process.exit(1);
	}

	const repos = JSON.parse(repoListRaw);
	const results = [];

	for (const repo of repos) {
		const pagesRaw = runGh(`api repos/${owner}/${repo.name}/pages`);
		let pagesInfo = null;
		if (pagesRaw) {
			try {
				pagesInfo = JSON.parse(pagesRaw);
			} catch (_) {}
		}

		const hasPages = Boolean(pagesInfo && pagesInfo.html_url);
		const domesticUrl = `https://${DEFAULT_DOMAIN}/repo/${repo.name}/`;
		const ghPagesUrl = pagesInfo?.html_url || `https://${owner.toLowerCase()}.github.io/${repo.name}/`;

		results.push({
			name: repo.name,
			isPrivate: repo.isPrivate,
			hasPages,
			status: pagesInfo?.status || (hasPages ? "built" : "disabled"),
			defaultBranch: repo.defaultBranchRef?.name || "main",
			domesticUrl: hasPages ? domesticUrl : "—",
			ghPagesUrl: hasPages ? ghPagesUrl : "—",
			description: repo.description || "",
			url: repo.url,
		});
	}

	if (asJson) {
		console.log(JSON.stringify(results, null, 2));
		return;
	}

	console.log("\n📦 仓库 GitHub Pages 与国内 EdgeOne 镜像状态一览：");
	console.log("=".repeat(95));
	console.log(
		`${"仓库名称 (Repository)".padEnd(28)} | ${"属性".padEnd(8)} | ${"Pages 状态".padEnd(12)} | ${"国内镜像路径 (isui.ren)"}`,
	);
	console.log("-".repeat(95));

	for (const r of results) {
		const visibility = r.isPrivate ? "私有 🔒" : "公开 🌐";
		const statusBadge = r.hasPages ? "已启用 ✅" : "未开启 ⭕";
		const pathStr = r.hasPages ? `/repo/${r.name}/` : "未就绪";
		console.log(
			`${r.name.padEnd(28)} | ${visibility.padEnd(8)} | ${statusBadge.padEnd(12)} | ${pathStr}`,
		);
	}
	console.log("=".repeat(95));
	const enabledCount = results.filter((r) => r.hasPages).length;
	console.log(`总计: ${results.length} 个仓库，${enabledCount} 个已开通 Pages。\n`);
}

async function enableCommand(owner, repoName, flags) {
	if (!repoName) {
		console.error("❌ Please specify repository name: shirone-repo-pages enable <repo-name>");
		process.exit(1);
	}

	console.log(`⚙️ Enabling GitHub Pages for ${owner}/${repoName}...`);

	// 1. Inspect default branch
	const repoInfoRaw = runGh(`repo view ${owner}/${repoName} --json defaultBranchRef,isPrivate`);
	if (!repoInfoRaw) {
		console.error(`❌ Repository ${owner}/${repoName} not found or inaccessible.`);
		process.exit(1);
	}
	const repoInfo = JSON.parse(repoInfoRaw);
	const defaultBranch = flags.branch || repoInfo.defaultBranchRef?.name || "main";
	const targetPath = flags.path || "/";

	console.log(`   Branch: ${defaultBranch}, Source Path: ${targetPath}`);

	// 2. Call GitHub Pages Enable API
	// Try creating or enabling Pages
	const enableOutput = runGh(
		`api -X POST repos/${owner}/${repoName}/pages -f "source[branch]=${defaultBranch}" -f "source[path]=${targetPath}"`,
	);

	if (enableOutput) {
		try {
			const res = JSON.parse(enableOutput);
			console.log(`\n✅ GitHub Pages enabled successfully!`);
			console.log(`   原始 URL:   ${res.html_url || `https://${owner.toLowerCase()}.github.io/${repoName}/`}`);
			console.log(`   国内镜像:   https://${DEFAULT_DOMAIN}/repo/${repoName}/`);
			console.log(`   EdgeOne 将在 GitHub 构建完毕后自动提供加速反代与边缘缓存。\n`);
			return;
		} catch (_) {}
	}

	console.log(`\n💡 If the repository already has an active GitHub Actions workflow for Pages,`);
	console.log(`   or if branch '${defaultBranch}' has no index.html or docs, ensure build artifact is ready.`);
	console.log(`   国内镜像访问路由预设为: https://${DEFAULT_DOMAIN}/repo/${repoName}/\n`);
}

async function syncCommand(owner, flags) {
	console.log(`🔄 Generating Shirone projectsData format for ${owner}...`);
	const repoListRaw = runGh(
		`repo list ${owner} --limit 50 --json name,isPrivate,description,url`,
	);
	if (!repoListRaw) {
		console.error("❌ Failed to query repositories.");
		process.exit(1);
	}

	const repos = JSON.parse(repoListRaw);
	const enabledRepos = [];

	for (const repo of repos) {
		if (repo.isPrivate) continue;
		const pagesRaw = runGh(`api repos/${owner}/${repo.name}/pages`);
		if (pagesRaw && pagesRaw.includes("html_url")) {
			enabledRepos.push(repo);
		}
	}

	const items = enabledRepos.map((r) => ({
		key: r.name.toLowerCase().replace(/[^a-z0-9_-]/g, "-"),
		title: r.name,
		summary: r.description || "GitHub 仓库与项目文档",
		category: "tool",
		phase: "shipped",
		technologies: ["GitHub Pages", "EdgeOne"],
		icon: "material-symbols:globe-asia-rounded",
		featured: false,
		website: `https://${DEFAULT_DOMAIN}/repo/${r.name}/`,
		repository: r.url,
		year: "2026",
	}));

	if (flags.json) {
		console.log(JSON.stringify(items, null, 2));
	} else {
		console.log("\n/* Copy into isui.ren-Blog/data/projects.ts: */");
		console.log(JSON.stringify(items, null, 2));
		console.log(`\n✅ Generated ${items.length} project items with domestic /repo/<repoName>/ URLs.\n`);
	}
}

async function main() {
	const { command, repoArg, flags } = parseArgs();
	const owner = flags.owner || DEFAULT_OWNER;

	switch (command) {
		case "inspect":
			await inspectCommand(owner, flags.json);
			break;
		case "enable":
			await enableCommand(owner, repoArg, flags);
			break;
		case "sync":
			await syncCommand(owner, flags);
			break;
		case "help":
		default:
			printUsage();
			break;
	}
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
