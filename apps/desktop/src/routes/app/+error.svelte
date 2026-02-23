<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';

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
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
	<!-- Back link -->
	<button
		onclick={() => history.back()}
		class="inline-flex cursor-pointer items-center gap-1 self-start font-mono text-xs text-fg-muted transition-colors hover:text-fg-dark"
	>
		&lt;- back
		<span class="opacity-50">(Backspace)</span>
	</button>

	<!-- Command that "failed" -->
	<div class="flex flex-col gap-1">
		<p class="font-mono text-xs text-fg-muted">
			<span class="text-green">$</span>
			cat {pathname}
		</p>
	</div>

	<!-- Error output -->
	<div class="flex flex-col gap-1">
		<p class="font-mono text-sm {status >= 500 ? 'text-red' : 'text-yellow'}">
			E{status}: {errorMessage}
		</p>
		{#if ERROR_MESSAGES[status] && message !== 'Not Found'}
			<p class="font-mono text-xs text-fg-muted">{message}</p>
		{/if}
	</div>

	<!-- Suggestions -->
	<div class="flex flex-col gap-2">
		<p class="font-mono text-xs text-fg-muted">try:</p>
		<div class="flex flex-col gap-1 pl-2">
			<a
				href="/app"
				class="group inline-flex items-center gap-4 font-mono text-xs text-fg-muted transition-colors hover:text-fg-dark"
			>
				<span class="text-primary">:e /app</span>
				<span>open tasks</span>
				<span class="opacity-0 transition-opacity group-hover:opacity-50">
					(Enter)
				</span>
			</a>
			<button
				onclick={() => history.back()}
				class="group inline-flex cursor-pointer items-center gap-4 font-mono text-xs text-fg-muted transition-colors hover:text-fg-dark"
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
	<div class="font-mono text-xs text-fg-muted">
		<span class="text-green">&gt;</span>
		<span class="animate-blink ml-1 inline-block">_</span>
	</div>
</div>
