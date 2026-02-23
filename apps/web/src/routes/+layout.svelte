<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import {
		PUBLIC_CONVEX_URL,
		PUBLIC_WORKOS_CLIENT_ID
	} from '$env/static/public';
	import { setupConvex, useConvexClient } from 'convex-svelte';
	import { setupWorkOSAuth } from '$lib/auth';

	let { children } = $props();

	setupConvex(PUBLIC_CONVEX_URL);
	const client = useConvexClient();
	setupWorkOSAuth(client, PUBLIC_WORKOS_CLIENT_ID, PUBLIC_CONVEX_URL);
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

{@render children()}
