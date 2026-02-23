<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { setContext } from 'svelte';
	import {
		isEditableTarget,
		detectTimezone,
		TIMEZONE_CTX,
		commandPalette,
		getDataProvider
	} from '@writequit/ui';
	import StatusLine from '@writequit/ui/components/StatusLine.svelte';
	import Tutorial from '@writequit/ui/components/Tutorial.svelte';
	import { getCurrentWindow } from '@tauri-apps/api/window';

	let { children } = $props();

	const provider = getDataProvider();
	const userSettings = provider.settings.get();

	// ── Timezone ────────────────────────────────────────────────────
	const browserTz = detectTimezone();
	let timezone = $derived(userSettings.current?.timezone ?? browserTz);
	setContext(TIMEZONE_CTX, () => timezone);

	// ── Tutorial ────────────────────────────────────────────────────
	let showTutorial = $state(false);

	let tutorialAutoShown = false;
	$effect(() => {
		if (
			!tutorialAutoShown &&
			userSettings.current &&
			!userSettings.current.tutorialCompleted
		) {
			tutorialAutoShown = true;
			showTutorial = true;
		}
	});

	async function completeTutorial() {
		showTutorial = false;
		await provider.settings.update({ tutorialCompleted: true });
	}

	// ── Global keyboard shortcuts ──────────────────────────────────
	let showHelp = $state(false);
	let sidebarOpen = $state(false);
	let pendingG = $state(false);
	let gTimer: ReturnType<typeof setTimeout> | undefined;

	// Register base command context
	$effect(() => {
		commandPalette.setBaseContext({
			signOut: () => {
				/* no auth in desktop */
			},
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
				await provider.sessions.log(args);
			},
			startTimer: async (args: {
				description?: string;
				tags: string[];
				startTime?: number;
			}) => {
				await provider.sessions.start(args);
			},
			stopTimer: async () => {
				await provider.sessions.stop();
			},
			showTutorial: () => {
				showTutorial = true;
			},
			linkTaskToSession: async (taskId: string) => {
				const active = provider.sessions.active();
				if (!active.current) throw new Error('No timer is running');
				await provider.sessions.linkTask(active.current.id, taskId);
			}
		});
	});

	interface NavItem {
		href: string;
		label: string;
		icon: string;
		shortcut: string;
	}

	// ── Window controls (Tauri) ────────────────────────────────────
	const appWindow = getCurrentWindow();

	async function minimizeWindow() {
		await appWindow.minimize();
	}
	async function toggleMaximize() {
		await appWindow.toggleMaximize();
	}
	async function closeWindow() {
		await appWindow.close();
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

	$effect(() => {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		page.url.pathname;
		sidebarOpen = false;
	});

	function handleKeydown(e: KeyboardEvent) {
		if (commandPalette.isOpen) return;
		if (isEditableTarget(e)) return;

		if (e.key === ':') {
			e.preventDefault();
			commandPalette.open();
			return;
		}

		if (e.key === '/') {
			e.preventDefault();
			commandPalette.openWithInput('s ');
			return;
		}

		if (e.key === '?') {
			e.preventDefault();
			showHelp = !showHelp;
			return;
		}

		if (e.key === 'Escape' && sidebarOpen) {
			sidebarOpen = false;
			return;
		}
		if (e.key === 'Escape' && showHelp) {
			showHelp = false;
			return;
		}

		if (pendingG) {
			pendingG = false;
			clearTimeout(gTimer);

			const routes: Record<string, string> = {
				t: '/app',
				s: '/app/sessions',
				r: '/app/reports',
				a: '/app/tags',
				u: '/app/user'
			};

			if (routes[e.key]) {
				e.preventDefault();
				goto(routes[e.key]);
			}
			return;
		}

		if (e.key === 'g') {
			pendingG = true;
			gTimer = setTimeout(() => {
				pendingG = false;
			}, 500);
			return;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="fixed inset-0 flex flex-col overflow-hidden">
	<!-- Top bar (draggable for window movement) -->
	<header
		data-tauri-drag-region
		class="flex shrink-0 items-center justify-between border-b border-border px-4 py-2"
	>
		<div class="flex items-center gap-2">
			<a href="/app" class="font-mono text-sm font-bold text-green">:wq</a>
			<span
				class="border border-magenta/50 px-1.5 py-0.5 font-mono text-[10px] leading-none text-magenta"
			>
				local
			</span>
		</div>

		<!-- Desktop nav -->
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
		</div>

		<!-- Window controls (no OS title bar) -->
		<div class="flex items-center gap-1">
			<!-- Mobile hamburger -->
			<button
				onclick={() => (sidebarOpen = !sidebarOpen)}
				class="cursor-pointer border border-transparent px-2 py-1 font-mono text-xs text-fg-muted transition-colors hover:border-border hover:text-fg-dark md:hidden"
				aria-label="Toggle menu"
			>
				{sidebarOpen ? '[x]' : '[=]'}
			</button>

			<button
				onclick={minimizeWindow}
				class="cursor-pointer px-2 py-1 font-mono text-xs text-fg-muted transition-colors hover:text-fg-dark"
				aria-label="Minimize"
			>
				_
			</button>
			<button
				onclick={toggleMaximize}
				class="cursor-pointer px-2 py-1 font-mono text-xs text-fg-muted transition-colors hover:text-fg-dark"
				aria-label="Maximize"
			>
				[]
			</button>
			<button
				onclick={closeWindow}
				class="cursor-pointer px-2 py-1 font-mono text-xs text-red/70 transition-colors hover:text-red"
				aria-label="Close"
			>
				x
			</button>
		</div>
	</header>

	<!-- Mobile sidebar overlay -->
	{#if sidebarOpen}
		<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
		<div
			class="fixed inset-0 z-40 md:hidden"
			onclick={() => (sidebarOpen = false)}
		>
			<div class="absolute inset-0 bg-bg-dark/60"></div>
			<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
			<div
				class="absolute top-0 right-0 flex h-full w-64 flex-col border-l border-border bg-bg"
				onclick={(e) => e.stopPropagation()}
			>
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
				</nav>
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
				<div class="text-center font-mono text-sm text-fg-muted">
					<p>Same shortcuts as the web app.</p>
					<p class="mt-2">
						Press <kbd
							class="border border-border bg-surface-2 px-1 text-primary"
						>
							?
						</kbd>
						to close.
					</p>
				</div>
			</div>
		</div>
	{/if}

	<!-- Main content -->
	<main class="min-h-0 flex-1 overflow-y-auto">
		{@render children()}
	</main>

	<!-- Status line -->
	<StatusLine />

	<!-- Tutorial -->
	{#if showTutorial}
		<Tutorial oncomplete={completeTutorial} />
	{/if}
</div>
