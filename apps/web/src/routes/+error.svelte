<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import favicon from '$lib/assets/favicon.svg';

	const status = $derived(page.status);
	const message = $derived(page.error?.message ?? 'unknown error');
	const pathname = $derived(page.url.pathname);

	const ERROR_MESSAGES: Record<number, string> = {
		401: 'Authentication required',
		403: 'Permission denied',
		404: 'No buffer loaded for this path',
		500: 'Unhandled exception in runtime',
		503: 'Service temporarily unavailable'
	};

	const errorMessage = $derived(ERROR_MESSAGES[status] ?? message);
	const pageTitle = $derived(status === 404 ? 'not found' : 'error');

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Backspace') {
			e.preventDefault();
			history.back();
		}
		if (e.key === 'Enter') {
			e.preventDefault();
			goto('/app');
		}
	}
</script>

<svelte:head>
	<title>{pageTitle} | :wq</title>
	<link rel="icon" href={favicon} />
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="flex min-h-svh flex-col bg-bg font-mono text-fg">
	<!-- Header -->
	<header class="border-b border-border px-6 py-3">
		<a href="/" class="font-mono text-sm font-bold text-green">:wq</a>
	</header>

	<!-- Error content -->
	<main class="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6">
		<!-- Command that "failed" -->
		<div class="flex flex-col gap-1">
			<p class="text-xs text-fg-muted">
				<span class="text-green">$</span>
				cat {pathname}
			</p>
		</div>

		<!-- Error output -->
		<div class="flex flex-col gap-1">
			<p class="text-sm {status >= 500 ? 'text-red' : 'text-yellow'}">
				E{status}: {errorMessage}
			</p>
			{#if ERROR_MESSAGES[status] && message !== 'Not Found'}
				<p class="text-xs text-fg-muted">{message}</p>
			{/if}
		</div>

		<!-- Suggestions -->
		<div class="flex flex-col gap-2">
			<p class="text-xs text-fg-muted">try:</p>
			<div class="flex flex-col gap-1 pl-2">
				<a
					href="/app"
					class="group flex items-center gap-4 text-xs text-fg-muted transition-colors hover:text-fg-dark"
				>
					<span class="text-primary">:e /app</span>
					<span>open tasks</span>
					<span class="opacity-0 transition-opacity group-hover:opacity-50">
						(Enter)
					</span>
				</a>
				<button
					onclick={() => history.back()}
					class="group flex cursor-pointer items-center gap-4 text-xs text-fg-muted transition-colors hover:text-fg-dark"
				>
					<span class="text-primary">&lt;- back</span>
					<span>previous page</span>
					<span class="opacity-0 transition-opacity group-hover:opacity-50">
						(Backspace)
					</span>
				</button>
			</div>
		</div>

		<!-- Blinking prompt -->
		<div class="text-xs text-fg-muted">
			<span class="text-green">&gt;</span>
			<span class="animate-blink ml-1 inline-block">_</span>
		</div>
	</main>
</div>
