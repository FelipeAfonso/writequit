<script lang="ts">
	import { useAuthActions } from '$lib/auth';

	const { signIn } = useAuthActions();

	let mode: 'signIn' | 'signUp' = $state('signIn');
	let name = $state('');
	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let error = $state('');
	let loading = $state(false);

	const MIN_PASSWORD_LENGTH = 6;

	function validate(): string | null {
		if (mode === 'signUp') {
			if (name.trim().length === 0) return 'name is required';
			if (password.length < MIN_PASSWORD_LENGTH)
				return `password must be at least ${MIN_PASSWORD_LENGTH} characters`;
			if (password !== confirmPassword) return 'passwords do not match';
		} else {
			if (password.length < MIN_PASSWORD_LENGTH)
				return `password must be at least ${MIN_PASSWORD_LENGTH} characters`;
		}
		return null;
	}

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		error = '';

		const validationError = validate();
		if (validationError) {
			error = validationError;
			return;
		}

		loading = true;

		try {
			const params: Record<string, string> = { email, password, flow: mode };
			if (mode === 'signUp') params.name = name.trim();
			await signIn('password', params);
		} catch (err) {
			error = err instanceof Error ? err.message : 'authentication failed';
			loading = false;
		}
	}
</script>

<form onsubmit={handleSubmit} class="flex flex-col gap-3">
	{#if mode === 'signUp'}
		<div class="flex flex-col gap-1">
			<label for="name" class="font-mono text-xs text-fg-muted">name</label>
			<input
				id="name"
				type="text"
				bind:value={name}
				required
				placeholder="your name"
				class="border border-border bg-surface-1 px-3 py-2 font-mono text-sm text-fg placeholder:text-fg-muted focus:border-primary focus:ring-0"
			/>
		</div>
	{/if}

	<div class="flex flex-col gap-1">
		<label for="email" class="font-mono text-xs text-fg-muted">email</label>
		<input
			id="email"
			type="email"
			bind:value={email}
			required
			placeholder="user@example.com"
			class="border border-border bg-surface-1 px-3 py-2 font-mono text-sm text-fg placeholder:text-fg-muted focus:border-primary focus:ring-0"
		/>
	</div>

	<div class="flex flex-col gap-1">
		<label for="password" class="font-mono text-xs text-fg-muted">
			password
			{#if mode === 'signUp'}
				<span class="text-fg-gutter">(min {MIN_PASSWORD_LENGTH} chars)</span>
			{/if}
		</label>
		<input
			id="password"
			type="password"
			bind:value={password}
			required
			minlength={MIN_PASSWORD_LENGTH}
			placeholder="********"
			class="border border-border bg-surface-1 px-3 py-2 font-mono text-sm text-fg placeholder:text-fg-muted focus:border-primary focus:ring-0"
		/>
	</div>

	{#if mode === 'signUp'}
		<div class="flex flex-col gap-1">
			<label for="confirm-password" class="font-mono text-xs text-fg-muted">
				confirm password
			</label>
			<input
				id="confirm-password"
				type="password"
				bind:value={confirmPassword}
				required
				minlength={MIN_PASSWORD_LENGTH}
				placeholder="********"
				class="border border-border bg-surface-1 px-3 py-2 font-mono text-sm text-fg placeholder:text-fg-muted focus:border-primary focus:ring-0"
			/>
		</div>
	{/if}

	{#if error}
		<p class="font-mono text-xs text-red">{error}</p>
	{/if}

	<button
		type="submit"
		disabled={loading}
		class="border border-green bg-surface-1 px-4 py-2.5 font-mono text-sm text-green transition-colors hover:bg-green hover:text-bg disabled:opacity-50"
	>
		{#if loading}
			<span class="animate-pulse">authenticating...</span>
		{:else if mode === 'signIn'}
			:auth sign in
		{:else}
			:auth sign up
		{/if}
	</button>

	<button
		type="button"
		onclick={() => {
			mode = mode === 'signIn' ? 'signUp' : 'signIn';
			error = '';
		}}
		class="font-mono text-xs text-fg-muted transition-colors hover:text-fg"
	>
		{#if mode === 'signIn'}
			no account? <span class="text-primary">sign up</span>
		{:else}
			have an account? <span class="text-primary">sign in</span>
		{/if}
	</button>
</form>
