<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { PUBLIC_CONVEX_URL } from '$env/static/public';
	import { setupConvex, useConvexClient } from 'convex-svelte';
	import { setupConvexAuth } from '$lib/auth';
	import { page } from '$app/state';

	let { children } = $props();

	// Set up the Convex client, then layer auth on top
	setupConvex(PUBLIC_CONVEX_URL);
	const client = useConvexClient();
	const authCtx = setupConvexAuth(client, PUBLIC_CONVEX_URL);

	// Reactive auth state — reads from context internals
	const auth = authCtx.state;
	const { signOut } = authCtx.actions;

	interface NavItem {
		href: string;
		label: string;
		icon: string;
	}

	const nav: NavItem[] = [
		{ href: '/', label: 'inbox', icon: '>' },
		{ href: '/tasks', label: 'tasks', icon: '*' },
		{ href: '/tags', label: 'tags', icon: '#' }
	];

	function isActive(href: string): boolean {
		const path = page.url.pathname;
		if (href === '/') return path === '/';
		return path.startsWith(href);
	}
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

{#if auth.isLoading}
	<!-- Loading state -->
	<div class="flex h-screen items-center justify-center">
		<p class="animate-pulse font-mono text-sm text-fg-muted">loading...</p>
	</div>
{:else if !auth.isAuthenticated}
	<!-- Unauthenticated: show login page -->
	<div class="flex h-screen flex-col">
		<main class="flex-1 overflow-y-auto">
			{@render children()}
		</main>
	</div>
{:else}
	<!-- Authenticated: show app -->
	<div class="flex h-screen flex-col">
		<!-- Top bar -->
		<header
			class="flex shrink-0 items-center justify-between border-b border-border px-4 py-2"
		>
			<a href="/" class="font-mono text-sm font-bold text-green">:wq</a>
			<div class="flex items-center gap-3">
				<nav class="flex items-center gap-1">
					{#each nav as item (item.href)}
						<a
							href={item.href}
							class="border px-2.5 py-1 font-mono text-xs transition-colors"
							class:border-primary={isActive(item.href)}
							class:text-primary={isActive(item.href)}
							class:bg-surface-2={isActive(item.href)}
							class:border-transparent={!isActive(item.href)}
							class:text-fg-muted={!isActive(item.href)}
							class:hover:text-fg-dark={!isActive(item.href)}
							class:hover:border-border={!isActive(item.href)}
						>
							<span class="opacity-60">{item.icon}</span>
							{item.label}
						</a>
					{/each}
				</nav>
				<button
					onclick={() => signOut()}
					class="border border-transparent px-2 py-1 font-mono text-xs text-fg-muted transition-colors hover:border-red hover:text-red"
				>
					:q!
				</button>
			</div>
		</header>

		<!-- Main content -->
		<main class="flex-1 overflow-y-auto">
			{@render children()}
		</main>
	</div>
{/if}
