<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { setContext } from 'svelte';
	import { useAuthState, useAuthActions } from '$lib/auth';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { PUBLIC_CONVEX_URL } from '$env/static/public';
	import { isEditableTarget } from '$lib/utils/keys';
	import { detectTimezone, TIMEZONE_CTX } from '$lib/utils/datetime';
	import { commandPalette } from '$lib/stores/commandPalette.svelte';
	import { PRELOADED_ACTIVE_SESSION_CTX } from '$lib/utils/preload';
	import StatusLine from '$lib/components/StatusLine.svelte';
	import Tutorial from '$lib/components/Tutorial.svelte';

	const isLocal = import.meta.env.DEV;
	const isDevConvex = PUBLIC_CONVEX_URL.includes(
		'REDACTED_DEV_DEPLOYMENT.convex.cloud'
	);
	const envBadge: 'dev-local' | 'local-prod' | 'dev-cloud' | null = isLocal
		? isDevConvex
			? 'dev-local'
			: 'local-prod'
		: isDevConvex
			? 'dev-cloud'
			: null;

	let { data, children } = $props();

	const auth = useAuthState();
	const { signOut } = useAuthActions();
	const client = useConvexClient();

	// ── Admin check ─────────────────────────────────────────────────
	const adminQuery = useQuery(api.admin.isAdmin, {});
	let isAdminUser = $derived(adminQuery.data === true);

	// ── Timezone ────────────────────────────────────────────────────
	const userSettings = useQuery(
		api.users.getSettings,
		() => (auth.isAuthenticated ? {} : 'skip'),
		() => ({
			initialData: data.preloaded?.settings
		})
	);
	const browserTz = detectTimezone();

	// Use server-stored timezone if available, otherwise fall back to browser.
	let timezone = $derived(userSettings.data?.timezone ?? browserTz);

	// Provide timezone to all child components via Svelte context.
	// We pass a getter function so consumers always read the latest value.
	setContext(TIMEZONE_CTX, () => timezone);

	// Provide preloaded active session to StatusBar via context.
	// One-time SSR seed — intentionally captures initial value.
	// svelte-ignore state_referenced_locally
	setContext(PRELOADED_ACTIVE_SESSION_CTX, data.preloaded?.activeSession);

	// Auto-detect and persist timezone on first visit (one-time)
	let tzPersisted = false;
	$effect(() => {
		if (
			!tzPersisted &&
			userSettings.data &&
			!userSettings.data.timezone &&
			auth.isAuthenticated
		) {
			tzPersisted = true;
			client.mutation(api.users.updateSettings, { timezone: browserTz });
		}
	});

	// Auth guard: redirect to landing page if not authenticated
	$effect(() => {
		if (!auth.isLoading && !auth.isAuthenticated) {
			goto('/');
		}
	});

	interface NavItem {
		href: string;
		label: string;
		icon: string;
		shortcut: string;
	}

	const nav: NavItem[] = [
		{ href: '/app', label: 'tasks', icon: '#', shortcut: 'g t' },
		{ href: '/app/sessions', label: 'sessions', icon: '~', shortcut: 'g s' },
		{ href: '/app/reports', label: 'reports', icon: '$', shortcut: 'g r' },
		{ href: '/app/tags', label: 'tags', icon: '+', shortcut: 'g a' }
	];

	function isActive(href: string): boolean {
		const path = page.url.pathname;
		if (href === '/app') return path === '/app';
		return path.startsWith(href);
	}

	// Close sidebar on route change
	$effect(() => {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		page.url.pathname;
		sidebarOpen = false;
	});

	// ── Tutorial ────────────────────────────────────────────────────
	let showTutorial = $state(false);

	// Auto-show tutorial for new users who haven't completed it.
	// The query is skipped until auth resolves, so userSettings.data
	// is only populated with real user data — never unauthenticated defaults.
	let tutorialAutoShown = false;
	$effect(() => {
		if (
			!tutorialAutoShown &&
			userSettings.data &&
			!userSettings.data.tutorialCompleted
		) {
			tutorialAutoShown = true;
			showTutorial = true;
		}
	});

	async function completeTutorial() {
		showTutorial = false;
		try {
			await client.mutation(api.users.updateSettings, {
				tutorialCompleted: true
			});
		} catch (err) {
			console.error('Failed to persist tutorial completion:', err);
		}
	}

	// ── Global keyboard shortcuts ──
	let showHelp = $state(false);
	let sidebarOpen = $state(false);
	let pendingG = $state(false);
	let gTimer: ReturnType<typeof setTimeout> | undefined;

	// Register base command context
	$effect(() => {
		commandPalette.setBaseContext({
			signOut: () => signOut(),
			toggleHelp: () => {
				showHelp = !showHelp;
			},
			getTimezone: () => timezone,
			logSession: async (args: {
				startTime: number;
				endTime: number;
				description?: string;
				tags: string[];
			}) => {
				await client.mutation(api.sessions.log, {
					startTime: args.startTime,
					endTime: args.endTime,
					description: args.description,
					tags: args.tags
				});
			},
			startTimer: async (args: {
				description?: string;
				tags: string[];
				startTime?: number;
			}) => {
				await client.mutation(api.sessions.start, {
					description: args.description,
					tags: args.tags,
					startTime: args.startTime
				});
			},
			stopTimer: async () => {
				await client.mutation(api.sessions.stop, {});
			},
			showTutorial: () => {
				showTutorial = true;
			},
			linkTaskToSession: async (taskId: string) => {
				// Find the active session first
				const active = await client.query(api.sessions.active, {});
				if (!active) throw new Error('No timer is running');
				await client.mutation(api.sessions.linkTask, {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					sessionId: active._id as any,
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					taskId: taskId as any
				});
			}
		});
	});

	function handleKeydown(e: KeyboardEvent) {
		// When command palette is open, let it handle all input
		if (commandPalette.isOpen) return;

		if (isEditableTarget(e)) return;

		// Open command palette with ':'
		if (e.key === ':') {
			e.preventDefault();
			commandPalette.open();
			return;
		}

		// Open command palette in search mode with '/'
		if (e.key === '/') {
			e.preventDefault();
			commandPalette.openWithInput('s ');
			return;
		}

		// Toggle help overlay
		if (e.key === '?') {
			e.preventDefault();
			showHelp = !showHelp;
			return;
		}

		// Escape closes help or sidebar
		if (e.key === 'Escape' && sidebarOpen) {
			sidebarOpen = false;
			return;
		}
		if (e.key === 'Escape' && showHelp) {
			showHelp = false;
			return;
		}

		// Two-key "g" sequences for navigation
		if (pendingG) {
			pendingG = false;
			clearTimeout(gTimer);

			const routes: Record<string, string> = {
				t: '/app',
				s: '/app/sessions',
				r: '/app/reports',
				a: '/app/tags',
				u: '/app/user',
				d: '/app/admin'
			};

			if (routes[e.key]) {
				e.preventDefault();
				goto(routes[e.key]);
			}
			return;
		}

		if (e.key === 'g') {
			pendingG = true;
			// Reset after 500ms if no second key
			gTimer = setTimeout(() => {
				pendingG = false;
			}, 500);
			return;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if auth.isLoading}
	<div class="flex h-screen items-center justify-center">
		<p class="animate-pulse font-mono text-sm text-fg-muted">loading...</p>
	</div>
{:else if auth.isAuthenticated}
	<div class="flex h-screen flex-col">
		<!-- Top bar -->
		<header
			class="flex shrink-0 items-center justify-between border-b border-border px-4 py-2"
		>
			<div class="flex items-center gap-2">
				<a href="/app" class="font-mono text-sm font-bold text-green">:wq</a>
				{#if envBadge}
					<span
						class="animate-env-pulse border px-1.5 py-0.5 font-mono text-[10px] leading-none
						{envBadge === 'dev-local'
							? 'border-orange/50 text-orange'
							: envBadge === 'local-prod'
								? 'border-red/50 text-red'
								: 'border-cyan/50 text-cyan'}"
					>
						{envBadge}
					</span>
				{/if}
			</div>

			<!-- Desktop nav (hidden on sm and below) -->
			<div class="hidden items-center gap-3 md:flex">
				<nav class="flex items-center gap-1">
					{#each nav as item (item.href)}
						<a
							href={item.href}
							class="cursor-pointer border px-2.5 py-1 font-mono text-xs transition-colors"
							class:border-primary={isActive(item.href)}
							class:text-primary={isActive(item.href)}
							class:bg-surface-2={isActive(item.href)}
							class:border-transparent={!isActive(item.href)}
							class:text-fg-muted={!isActive(item.href)}
							class:hover:text-fg-dark={!isActive(item.href)}
							class:hover:border-border={!isActive(item.href)}
							title="{item.label} ({item.shortcut})"
						>
							<span class="opacity-60">{item.icon}</span>
							{item.label}
							<span class="ml-1 text-fg-muted opacity-50">
								{item.shortcut}
							</span>
						</a>
					{/each}
				</nav>
				<a
					href="/app/user"
					class="cursor-pointer border px-2 py-1 font-mono text-xs transition-colors"
					class:border-primary={isActive('/app/user')}
					class:text-primary={isActive('/app/user')}
					class:bg-surface-2={isActive('/app/user')}
					class:border-transparent={!isActive('/app/user')}
					class:text-fg-muted={!isActive('/app/user')}
					class:hover:text-fg-dark={!isActive('/app/user')}
					class:hover:border-border={!isActive('/app/user')}
					title="user settings (g u)"
				>
					<span class="opacity-60">@</span>
					user
					<span class="ml-1 text-fg-muted opacity-50">g u</span>
				</a>
				<button
					onclick={() => signOut()}
					class="cursor-pointer border border-transparent px-2 py-1 font-mono text-xs text-fg-muted transition-colors hover:border-red hover:text-red"
				>
					:q!
				</button>
			</div>

			<!-- Mobile hamburger (visible on sm and below) -->
			<button
				onclick={() => (sidebarOpen = !sidebarOpen)}
				class="cursor-pointer border border-transparent px-2 py-1 font-mono text-xs text-fg-muted transition-colors hover:border-border hover:text-fg-dark md:hidden"
				aria-label="Toggle menu"
			>
				{sidebarOpen ? '[x]' : '[=]'}
			</button>
		</header>

		<!-- Mobile sidebar overlay -->
		{#if sidebarOpen}
			<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
			<div
				class="fixed inset-0 z-40 md:hidden"
				onclick={() => (sidebarOpen = false)}
			>
				<!-- Backdrop -->
				<div class="absolute inset-0 bg-bg-dark/60"></div>

				<!-- Sidebar panel -->
				<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
				<div
					class="absolute top-0 right-0 flex h-full w-64 flex-col border-l border-border bg-bg"
					onclick={(e) => e.stopPropagation()}
				>
					<!-- Sidebar header -->
					<div
						class="flex items-center justify-between border-b border-border px-4 py-2"
					>
						<span class="font-mono text-xs text-fg-muted">nav</span>
						<button
							onclick={() => (sidebarOpen = false)}
							class="cursor-pointer border border-transparent px-2 py-1 font-mono text-xs text-fg-muted transition-colors hover:border-border hover:text-fg-dark"
						>
							[x]
						</button>
					</div>

					<!-- Nav links -->
					<nav class="flex flex-1 flex-col gap-1 p-3">
						{#each nav as item (item.href)}
							<a
								href={item.href}
								class="flex items-center justify-between border px-3 py-2 font-mono text-xs transition-colors"
								class:border-primary={isActive(item.href)}
								class:text-primary={isActive(item.href)}
								class:bg-surface-2={isActive(item.href)}
								class:border-transparent={!isActive(item.href)}
								class:text-fg-muted={!isActive(item.href)}
								class:hover:text-fg-dark={!isActive(item.href)}
								class:hover:border-border={!isActive(item.href)}
							>
								<span>
									<span class="opacity-60">{item.icon}</span>
									{item.label}
								</span>
								<span class="text-fg-muted opacity-50">{item.shortcut}</span>
							</a>
						{/each}

						<div class="my-2 border-t border-border"></div>

						<a
							href="/app/user"
							class="flex items-center justify-between border px-3 py-2 font-mono text-xs transition-colors"
							class:border-primary={isActive('/app/user')}
							class:text-primary={isActive('/app/user')}
							class:bg-surface-2={isActive('/app/user')}
							class:border-transparent={!isActive('/app/user')}
							class:text-fg-muted={!isActive('/app/user')}
							class:hover:text-fg-dark={!isActive('/app/user')}
							class:hover:border-border={!isActive('/app/user')}
						>
							<span>
								<span class="opacity-60">@</span>
								user
							</span>
							<span class="text-fg-muted opacity-50">g u</span>
						</a>

						{#if isAdminUser}
							<a
								href="/app/admin"
								class="flex items-center justify-between border px-3 py-2 font-mono text-xs transition-colors"
								class:border-primary={isActive('/app/admin')}
								class:text-primary={isActive('/app/admin')}
								class:bg-surface-2={isActive('/app/admin')}
								class:border-transparent={!isActive('/app/admin')}
								class:text-fg-muted={!isActive('/app/admin')}
								class:hover:text-fg-dark={!isActive('/app/admin')}
								class:hover:border-border={!isActive('/app/admin')}
							>
								<span>
									<span class="opacity-60">%</span>
									admin
								</span>
								<span class="text-fg-muted opacity-50">g d</span>
							</a>
						{/if}
					</nav>

					<!-- Sign out at bottom -->
					<div class="border-t border-border p-3">
						<button
							onclick={() => signOut()}
							class="w-full cursor-pointer border border-transparent px-3 py-2 text-left font-mono text-xs text-fg-muted transition-colors hover:border-red hover:text-red"
						>
							:q!
						</button>
					</div>
				</div>
			</div>
		{/if}

		<!-- Pending g indicator -->
		{#if pendingG}
			<div
				class="fixed right-4 bottom-4 z-50 border border-border-highlight bg-surface-1 px-3 py-1.5 font-mono text-xs text-primary"
			>
				g-
			</div>
		{/if}

		<!-- Help overlay -->
		{#if showHelp}
			<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
			<div
				class="fixed inset-0 z-50 flex items-center justify-center bg-bg-dark/80"
				onclick={() => (showHelp = false)}
				role="dialog"
				tabindex="-1"
			>
				<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
				<div
					class="flex max-h-[70vh] w-full max-w-2xl flex-col border border-border-highlight bg-surface-1 p-6"
					onclick={(e) => e.stopPropagation()}
				>
					<div class="mb-4 flex shrink-0 items-center justify-between">
						<h2 class="font-mono text-sm font-bold text-fg">
							keyboard shortcuts
						</h2>
						<span class="font-mono text-xs text-fg-muted">? to toggle</span>
					</div>
					<div class="grid grid-cols-1 gap-4 overflow-y-auto sm:grid-cols-2">
						<div>
							<h3 class="mb-2 font-mono text-xs font-bold text-fg-muted">
								general
							</h3>
							<div class="flex flex-col gap-1.5">
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">
										command palette
									</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										:
									</kbd>
								</div>
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">search</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										/
									</kbd>
								</div>
							</div>
						</div>
						<div>
							<h3 class="mb-2 font-mono text-xs font-bold text-fg-muted">
								navigation
							</h3>
							<div class="flex flex-col gap-1.5">
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">
										go to tasks
									</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										g t
									</kbd>
								</div>
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">go to tags</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										g a
									</kbd>
								</div>
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">
										go to sessions
									</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										g s
									</kbd>
								</div>
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">
										go to reports
									</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										g r
									</kbd>
								</div>
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">go to user</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										g u
									</kbd>
								</div>
								{#if isAdminUser}
									<div class="flex items-center justify-between">
										<span class="font-mono text-sm text-fg-dark">
											go to admin
										</span>
										<kbd
											class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
										>
											g d
										</kbd>
									</div>
								{/if}
							</div>
						</div>
						<div>
							<h3 class="mb-2 font-mono text-xs font-bold text-fg-muted">
								task list
							</h3>
							<div class="flex flex-col gap-1.5">
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">
										focus input
									</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										i
									</kbd>
								</div>
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">move down</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										j / ↓
									</kbd>
								</div>
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">move up</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										k / ↑
									</kbd>
								</div>
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">
										filter prev/next
									</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										h l / ← →
									</kbd>
								</div>
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">open task</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										Enter
									</kbd>
								</div>
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">
										toggle status
									</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										x
									</kbd>
								</div>
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">
										first / last
									</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										gg / G
									</kbd>
								</div>
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">toggle tag</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										t 1-9
									</kbd>
								</div>
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">clear tags</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										t 0
									</kbd>
								</div>
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">
										delete task
									</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										dd
									</kbd>
								</div>
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">edit task</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										cc
									</kbd>
								</div>
							</div>
						</div>
						<div>
							<h3 class="mb-2 font-mono text-xs font-bold text-fg-muted">
								editor (vi mode)
							</h3>
							<div class="flex flex-col gap-1.5">
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">
										enter insert mode
									</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										i
									</kbd>
								</div>
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">
										back to normal
									</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										Esc
									</kbd>
								</div>
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">
										blur editor
									</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										Esc Esc
									</kbd>
								</div>
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">
										command palette
									</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										:
									</kbd>
								</div>
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">
										search in editor
									</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										/
									</kbd>
								</div>
							</div>
						</div>
						<div>
							<h3 class="mb-2 font-mono text-xs font-bold text-fg-muted">
								task detail
							</h3>
							<div class="flex flex-col gap-1.5">
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">go back</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										Backspace
									</kbd>
								</div>
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">
										delete task
									</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										dd
									</kbd>
								</div>
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">edit task</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										cc
									</kbd>
								</div>
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">
										focus editor
									</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										i
									</kbd>
								</div>
							</div>
						</div>
						<div>
							<h3 class="mb-2 font-mono text-xs font-bold text-fg-muted">
								time tracking
							</h3>
							<div class="flex flex-col gap-1.5">
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">
										start timer
									</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										:start
									</kbd>
								</div>
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">stop timer</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										:stop
									</kbd>
								</div>
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">log time</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										:log
									</kbd>
								</div>
							</div>
						</div>
						<div>
							<h3 class="mb-2 font-mono text-xs font-bold text-fg-muted">
								session list
							</h3>
							<div class="flex flex-col gap-1.5">
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">
										focus start
									</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										s
									</kbd>
								</div>
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">move down</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										j / ↓
									</kbd>
								</div>
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">move up</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										k / ↑
									</kbd>
								</div>
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">date range</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										h l / ← →
									</kbd>
								</div>
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">
										open session
									</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										Enter
									</kbd>
								</div>
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">
										first / last
									</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										gg / G
									</kbd>
								</div>
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">toggle tag</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										t 1-9
									</kbd>
								</div>
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">clear tags</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										t 0
									</kbd>
								</div>
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">
										delete session
									</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										dd
									</kbd>
								</div>
							</div>
						</div>
						<div>
							<h3 class="mb-2 font-mono text-xs font-bold text-fg-muted">
								session detail
							</h3>
							<div class="flex flex-col gap-1.5">
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">
										edit session
									</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										cc
									</kbd>
								</div>
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">
										delete session
									</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										dd
									</kbd>
								</div>
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">go back</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										Backspace
									</kbd>
								</div>
							</div>
						</div>
						<div>
							<h3 class="mb-2 font-mono text-xs font-bold text-fg-muted">
								tag list
							</h3>
							<div class="flex flex-col gap-1.5">
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">move down</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										j / ↓
									</kbd>
								</div>
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">move up</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										k / ↑
									</kbd>
								</div>
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">prev type</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										h / ←
									</kbd>
								</div>
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">next type</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										l / →
									</kbd>
								</div>
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">
										first / last
									</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										gg / G
									</kbd>
								</div>
								<div class="flex items-center justify-between">
									<span class="font-mono text-sm text-fg-dark">delete tag</span>
									<kbd
										class="border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-primary"
									>
										dd
									</kbd>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		{/if}

		<!-- Main content -->
		<main class="flex-1 overflow-y-auto">
			{@render children()}
		</main>

		<!-- Unified status line / command bar -->
		<StatusLine />

		<!-- Tutorial overlay (auto-shown for new users, or via :tutorial command) -->
		{#if showTutorial}
			<Tutorial oncomplete={completeTutorial} />
		{/if}
	</div>
{/if}
