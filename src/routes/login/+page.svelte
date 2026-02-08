<script lang="ts">
	import { goto } from '$app/navigation';
	import { useAuthState, useAuthActions } from '$lib/auth';

	const auth = useAuthState();
	const { signIn } = useAuthActions();

	let loading = $state(false);

	// If already authenticated, redirect to inbox
	$effect(() => {
		if (!auth.isLoading && auth.isAuthenticated) {
			goto('/app');
		}
	});

	async function handleSignIn() {
		loading = true;
		try {
			await signIn();
		} catch {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>login | :wq</title>
</svelte:head>

{#if auth.isLoading}
	<div class="flex h-screen items-center justify-center">
		<p class="animate-pulse font-mono text-sm text-fg-muted">loading...</p>
	</div>
{:else if !auth.isAuthenticated}
	<div class="flex min-h-screen items-center justify-center px-4">
		<div class="w-full max-w-sm space-y-8">
			<!-- Logo / Header -->
			<div class="text-center">
				<h1 class="font-mono text-3xl font-bold text-green">:wq</h1>
				<p class="mt-2 font-mono text-sm text-fg-muted">write, quit, ship.</p>
			</div>

			<!-- Sign In Button -->
			<button
				onclick={handleSignIn}
				disabled={loading}
				class="flex w-full items-center justify-center border border-green bg-surface-1 px-4 py-2.5 font-mono text-sm text-green transition-colors hover:bg-green hover:text-bg disabled:opacity-50"
			>
				{#if loading}
					<span class="animate-pulse">connecting...</span>
				{:else}
					:auth sign in
				{/if}
			</button>

			<!-- Footer -->
			<p class="text-center font-mono text-xs text-fg-muted">
				tasks, time, invoices &mdash; no bs.
			</p>
		</div>
	</div>
{/if}
