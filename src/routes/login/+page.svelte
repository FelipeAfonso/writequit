<script lang="ts">
	import OAuthButton from '$lib/components/auth/OAuthButton.svelte';
	import SignInForm from '$lib/components/auth/SignInForm.svelte';
</script>

<div class="flex min-h-full items-center justify-center px-4">
	<div class="w-full max-w-sm space-y-8">
		<!-- Logo / Header -->
		<div class="text-center">
			<h1 class="font-mono text-3xl font-bold text-green">:wq</h1>
			<p class="mt-2 font-mono text-sm text-fg-muted">write, quit, ship.</p>
		</div>

		<!-- OAuth Buttons -->
		<div class="space-y-2">
			<OAuthButton provider="github" label="sign in with github" icon="$" />
			<OAuthButton provider="google" label="sign in with google" icon="@" />
		</div>

		<!-- Divider -->
		<div class="flex items-center gap-3">
			<div class="h-px flex-1 bg-border"></div>
			<span class="font-mono text-xs text-fg-muted">or</span>
			<div class="h-px flex-1 bg-border"></div>
		</div>

		<!-- Password Form -->
		<SignInForm />

		<!-- Footer -->
		<p class="text-center font-mono text-xs text-fg-muted">
			tasks, time, invoices &mdash; no bs.
		</p>
	</div>
</div>
