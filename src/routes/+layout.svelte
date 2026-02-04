<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { PUBLIC_CONVEX_URL } from '$env/static/public';
	import { setupConvex, useConvexClient } from 'convex-svelte';
	import { setupConvexAuth } from '$lib/auth';

	let { children } = $props();

	setupConvex(PUBLIC_CONVEX_URL);
	const client = useConvexClient();
	setupConvexAuth(client, PUBLIC_CONVEX_URL);
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

{@render children()}
