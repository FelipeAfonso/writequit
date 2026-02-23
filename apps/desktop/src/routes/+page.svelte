<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	// Desktop app: skip landing page, go straight to the app
	onMount(() => {
		goto('/app');
	});
</script>

<svelte:head>
	<title>:wq</title>
</svelte:head>

<div class="flex h-screen items-center justify-center">
	<p class="animate-pulse font-mono text-sm text-fg-muted">loading...</p>
</div>
