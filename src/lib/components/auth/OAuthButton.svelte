<script lang="ts">
	import { useAuthActions } from '$lib/auth';

	let {
		provider,
		label,
		icon
	}: {
		provider: string;
		label: string;
		icon: string;
	} = $props();

	const { signIn } = useAuthActions();
	let loading = $state(false);

	async function handleClick() {
		loading = true;
		try {
			await signIn(provider);
		} catch {
			loading = false;
		}
	}
</script>

<button
	onclick={handleClick}
	disabled={loading}
	class="flex w-full items-center justify-center gap-2 border border-border bg-surface-1 px-4 py-2.5 font-mono text-sm text-fg transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
>
	<span class="text-fg-muted">{icon}</span>
	{#if loading}
		<span class="animate-pulse">connecting...</span>
	{:else}
		{label}
	{/if}
</button>
