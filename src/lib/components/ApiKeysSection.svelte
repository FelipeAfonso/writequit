<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { PUBLIC_CONVEX_SITE_URL } from '$env/static/public';
	import { formatShortDate, detectTimezone } from '$lib/utils/datetime';

	const client = useConvexClient();
	const keys = useQuery(api.apiKeys.list, {});

	const tz = detectTimezone();

	// ── Create flow ────────────────────────────────────────────────
	let nameValue = $state('');
	let creating = $state(false);
	let createError = $state('');
	/** The freshly created key — shown exactly once, never retrievable again. */
	let newKey = $state<{ key: string; name: string } | null>(null);

	async function createKey() {
		const name = nameValue.trim();
		if (name.length === 0) {
			createError = 'name cannot be empty';
			return;
		}
		creating = true;
		createError = '';
		try {
			const result = await client.mutation(api.apiKeys.create, { name });
			newKey = { key: result.key, name };
			nameValue = '';
		} catch (err) {
			createError = err instanceof Error ? err.message : 'failed to create key';
		} finally {
			creating = false;
		}
	}

	// ── Revoke flow ────────────────────────────────────────────────
	let confirmingRevoke = $state<Id<'apiKeys'> | null>(null);

	async function revokeKey(id: Id<'apiKeys'>) {
		try {
			await client.mutation(api.apiKeys.revoke, { id });
		} catch (err) {
			console.error('Failed to revoke key:', err);
		} finally {
			confirmingRevoke = null;
		}
	}

	// ── Copy helper ────────────────────────────────────────────────
	let copied = $state('');

	async function copy(label: string, text: string) {
		await navigator.clipboard.writeText(text);
		copied = label;
		setTimeout(() => {
			if (copied === label) copied = '';
		}, 2000);
	}

	function connectorUrl(key: string): string {
		return `${PUBLIC_CONVEX_SITE_URL}/mcp/${key}`;
	}

	function claudeCodeCmd(key: string): string {
		return `claude mcp add --transport http writequit ${PUBLIC_CONVEX_SITE_URL}/mcp --header "Authorization: Bearer ${key}"`;
	}

	function lastUsedLabel(lastUsedAt: number | undefined): string {
		if (lastUsedAt === undefined) return 'never used';
		const mins = Math.floor((Date.now() - lastUsedAt) / 60_000);
		if (mins < 1) return 'used just now';
		if (mins < 60) return `used ${mins}m ago`;
		const hours = Math.floor(mins / 60);
		if (hours < 24) return `used ${hours}h ago`;
		const days = Math.floor(hours / 24);
		if (days < 7) return `used ${days}d ago`;
		return `used ${formatShortDate(lastUsedAt, tz)}`;
	}

	const inputClass =
		'border border-border bg-surface-1 px-3 py-2 font-mono text-sm text-fg placeholder:text-fg-muted focus:border-primary focus:ring-0 w-full';
</script>

<section class="flex flex-col gap-4">
	<h2
		class="border-b border-border pb-2 font-mono text-sm font-bold text-fg-dark"
	>
		-- agent access
	</h2>

	<div class="flex flex-col gap-0.5">
		<span class="font-mono text-sm text-fg-dark">api keys</span>
		<span class="font-mono text-xs text-fg-muted">
			let AI agents (claude.ai, Claude Code, any MCP client) read and write your
			tasks — and only your tasks
		</span>
	</div>

	<!-- Create key -->
	<div class="flex items-center gap-2">
		<input
			type="text"
			bind:value={nameValue}
			class={inputClass}
			placeholder="key name, e.g. claude.ai"
			onkeydown={(e) => {
				if (e.key === 'Enter') createKey();
			}}
		/>
		<button
			type="button"
			class="shrink-0 cursor-pointer border border-green px-3 py-2 font-mono text-xs text-green transition-colors hover:bg-green hover:text-bg-dark disabled:cursor-wait disabled:opacity-50"
			onclick={createKey}
			disabled={creating}
		>
			{creating ? 'creating...' : ':new key'}
		</button>
	</div>
	{#if createError}
		<p class="font-mono text-xs text-red">{createError}</p>
	{/if}

	<!-- Freshly created key: shown exactly once -->
	{#if newKey}
		<div class="flex flex-col gap-3 border border-green bg-surface-1 p-3">
			<div class="flex items-baseline justify-between gap-2">
				<span class="font-mono text-xs font-bold text-green">
					key created — copy it now, it will not be shown again
				</span>
				<button
					type="button"
					class="cursor-pointer font-mono text-xs text-fg-muted hover:text-fg-dark"
					onclick={() => (newKey = null)}
				>
					[x] dismiss
				</button>
			</div>

			<div class="flex items-center gap-2">
				<code
					class="flex-1 overflow-x-auto border border-border bg-surface-2 px-3 py-2 font-mono text-xs break-all text-fg"
				>
					{newKey.key}
				</code>
				<button
					type="button"
					class="shrink-0 cursor-pointer border border-border px-3 py-2 font-mono text-xs text-fg-muted transition-colors hover:border-primary hover:text-primary"
					onclick={() => copy('key', newKey!.key)}
				>
					{copied === 'key' ? 'copied!' : ':y copy'}
				</button>
			</div>

			<div class="flex flex-col gap-1">
				<span class="font-mono text-xs text-fg-muted">
					claude.ai → settings → connectors → add custom connector → paste this
					URL:
				</span>
				<div class="flex items-center gap-2">
					<code
						class="flex-1 overflow-x-auto border border-border bg-surface-2 px-3 py-2 font-mono text-xs break-all text-fg-dark"
					>
						{connectorUrl(newKey.key)}
					</code>
					<button
						type="button"
						class="shrink-0 cursor-pointer border border-border px-3 py-2 font-mono text-xs text-fg-muted transition-colors hover:border-primary hover:text-primary"
						onclick={() => copy('url', connectorUrl(newKey!.key))}
					>
						{copied === 'url' ? 'copied!' : ':y copy'}
					</button>
				</div>
			</div>

			<div class="flex flex-col gap-1">
				<span class="font-mono text-xs text-fg-muted">claude code:</span>
				<div class="flex items-center gap-2">
					<code
						class="flex-1 overflow-x-auto border border-border bg-surface-2 px-3 py-2 font-mono text-xs break-all text-fg-dark"
					>
						{claudeCodeCmd(newKey.key)}
					</code>
					<button
						type="button"
						class="shrink-0 cursor-pointer border border-border px-3 py-2 font-mono text-xs text-fg-muted transition-colors hover:border-primary hover:text-primary"
						onclick={() => copy('cmd', claudeCodeCmd(newKey!.key))}
					>
						{copied === 'cmd' ? 'copied!' : ':y copy'}
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Key list -->
	{#if keys.isLoading}
		<p class="animate-pulse font-mono text-sm text-fg-muted">loading...</p>
	{:else if keys.data && keys.data.length > 0}
		<div class="flex flex-col gap-2">
			{#each keys.data as key (key._id)}
				<div
					class="flex items-center justify-between gap-3 border border-border bg-surface-1 px-3 py-2"
					class:opacity-50={key.revoked}
				>
					<div class="flex min-w-0 flex-col gap-0.5">
						<div class="flex items-baseline gap-2">
							<code class="font-mono text-sm text-fg">{key.prefix}…</code>
							<span class="truncate font-mono text-xs text-fg-dark">
								{key.name}
							</span>
							{#if key.revoked}
								<span class="font-mono text-xs text-red">revoked</span>
							{/if}
						</div>
						<span class="font-mono text-xs text-fg-muted">
							created {formatShortDate(key.createdAt, tz)} · {lastUsedLabel(
								key.lastUsedAt
							)}
						</span>
					</div>
					{#if !key.revoked}
						{#if confirmingRevoke === key._id}
							<div class="flex shrink-0 gap-2">
								<button
									type="button"
									class="cursor-pointer border border-red px-3 py-1 font-mono text-xs text-red transition-colors hover:bg-red hover:text-bg-dark"
									onclick={() => revokeKey(key._id)}
								>
									:revoke!
								</button>
								<button
									type="button"
									class="cursor-pointer border border-border px-3 py-1 font-mono text-xs text-fg-muted transition-colors hover:border-border-highlight hover:text-fg-dark"
									onclick={() => (confirmingRevoke = null)}
								>
									:q cancel
								</button>
							</div>
						{:else}
							<button
								type="button"
								class="shrink-0 cursor-pointer border border-border px-3 py-1 font-mono text-xs text-fg-muted transition-colors hover:border-red hover:text-red"
								onclick={() => (confirmingRevoke = key._id)}
							>
								:revoke
							</button>
						{/if}
					{/if}
				</div>
			{/each}
		</div>
	{:else}
		<p class="font-mono text-xs text-fg-muted">
			no keys yet — create one to connect an agent
		</p>
	{/if}
</section>
