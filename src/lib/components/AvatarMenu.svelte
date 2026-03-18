<script lang="ts">
	let {
		unreadCount,
		isAdminUser,
		isActive,
		signOut,
		onnavigate
	}: {
		unreadCount: number;
		isAdminUser: boolean;
		isActive: (href: string) => boolean;
		signOut: () => void;
		onnavigate?: () => void;
	} = $props();

	let open = $state(false);

	function toggle() {
		open = !open;
	}

	function close() {
		open = false;
	}

	function handleClickOutside(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (!target.closest('.avatar-menu')) {
			close();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) {
			close();
		}
	}

	function navigate() {
		close();
		onnavigate?.();
	}
</script>

<svelte:window onclick={handleClickOutside} onkeydown={handleKeydown} />

<div class="avatar-menu relative">
	<button
		onclick={toggle}
		class="relative cursor-pointer border px-1.5 py-0.5 font-mono transition-colors
			{open
			? 'border-primary bg-surface-2 text-primary'
			: 'border-transparent text-fg-muted hover:border-border hover:text-fg-dark'}"
		aria-label="User menu"
		aria-expanded={open}
	>
		<span class="text-lg leading-none">&#9823;</span>
		{#if unreadCount > 0}
			<span class="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 bg-cyan"></span>
		{/if}
	</button>

	{#if open}
		<div
			class="absolute top-full right-0 z-50 mt-1 min-w-48 border border-border bg-bg shadow-lg"
		>
			<nav class="flex flex-col py-1">
				<a
					href="/app/inbox"
					onclick={navigate}
					class="flex items-center justify-between px-3 py-1.5 font-mono text-xs transition-colors
						{isActive('/app/inbox')
						? 'bg-surface-2 text-primary'
						: 'text-fg-muted hover:bg-surface-1 hover:text-fg-dark'}"
				>
					<span>
						<span class="opacity-60">!</span>
						inbox{#if unreadCount > 0}<span class="ml-1 text-cyan">
								[{unreadCount}]
							</span>{/if}
					</span>
					<span class="text-fg-muted opacity-50">g i</span>
				</a>

				<a
					href="/app/tags"
					onclick={navigate}
					class="flex items-center justify-between px-3 py-1.5 font-mono text-xs transition-colors
						{isActive('/app/tags')
						? 'bg-surface-2 text-primary'
						: 'text-fg-muted hover:bg-surface-1 hover:text-fg-dark'}"
				>
					<span>
						<span class="opacity-60">+</span>
						tags
					</span>
					<span class="text-fg-muted opacity-50">g a</span>
				</a>

				<a
					href="/app/user"
					onclick={navigate}
					class="flex items-center justify-between px-3 py-1.5 font-mono text-xs transition-colors
						{isActive('/app/user')
						? 'bg-surface-2 text-primary'
						: 'text-fg-muted hover:bg-surface-1 hover:text-fg-dark'}"
				>
					<span>
						<span class="opacity-60">@</span>
						user
					</span>
					<span class="text-fg-muted opacity-50">g u</span>
				</a>

				{#if isAdminUser}
					<a
						href="/app/admin"
						onclick={navigate}
						class="flex items-center justify-between px-3 py-1.5 font-mono text-xs transition-colors
							{isActive('/app/admin')
							? 'bg-surface-2 text-primary'
							: 'text-fg-muted hover:bg-surface-1 hover:text-fg-dark'}"
					>
						<span>
							<span class="opacity-60">%</span>
							admin
						</span>
						<span class="text-fg-muted opacity-50">g d</span>
					</a>
				{/if}

				<div class="my-1 border-t border-border"></div>

				<button
					onclick={() => {
						close();
						signOut();
					}}
					class="flex w-full cursor-pointer items-center px-3 py-1.5 text-left font-mono text-xs text-fg-muted transition-colors hover:bg-surface-1 hover:text-red"
				>
					:q!
					<span class="ml-1 opacity-70">sign out</span>
				</button>
			</nav>
		</div>
	{/if}
</div>
