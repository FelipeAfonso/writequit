<script lang="ts">
	import '@writequit/ui/styles';
	import { setDataProvider } from '@writequit/ui';
	import { createFileDataProvider } from '$lib/data/provider.svelte';

	let { children } = $props();

	// Initialize the file-based data provider for the desktop app
	const provider = createFileDataProvider();
	setDataProvider(provider);
</script>

<svelte:head>
	<title>:wq</title>
</svelte:head>

{@render children()}
