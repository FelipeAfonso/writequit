<script lang="ts">
	/**
	 * OAuth callback page.
	 *
	 * WorkOS AuthKit JS SDK handles the token exchange automatically
	 * when the client initializes and detects the `code` parameter
	 * in the URL. This page just shows a loading state while the
	 * root layout's setupWorkOSAuth() processes the callback.
	 *
	 * The auth state change will trigger the login page's redirect
	 * to /app once authenticated.
	 */
	import { goto } from '$app/navigation';
	import { useAuthState } from '$lib/auth';

	const auth = useAuthState();

	$effect(() => {
		if (!auth.isLoading) {
			if (auth.isAuthenticated) {
				goto('/app');
			} else {
				goto('/');
			}
		}
	});
</script>

<svelte:head>
	<title>authenticating... | :wq</title>
</svelte:head>

<div class="flex h-screen items-center justify-center">
	<p class="animate-pulse font-mono text-sm text-fg-muted">authenticating...</p>
</div>
