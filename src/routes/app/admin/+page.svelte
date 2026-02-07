<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';

	const client = useConvexClient();
	const adminCheck = useQuery(api.admin.isAdmin, {});

	let seeding = $state(false);
	let result = $state<{ tags: number; tasks: number; sessions: number } | null>(
		null
	);
	let error = $state<string | null>(null);

	async function handleSeed() {
		seeding = true;
		result = null;
		error = null;

		try {
			const res = await client.mutation(api.admin.seedData, {});
			result = res;
		} catch (err) {
			error = err instanceof Error ? err.message : 'seed failed';
		} finally {
			seeding = false;
		}
	}
</script>

<svelte:head>
	<title>admin | :wq</title>
</svelte:head>

{#if adminCheck.data === false}
	<div class="flex h-full items-center justify-center p-8">
		<p class="font-mono text-sm text-red">access denied</p>
	</div>
{:else if adminCheck.data === true}
	<div class="mx-auto max-w-2xl p-6">
		<h1 class="mb-1 font-mono text-lg font-bold text-fg">*admin</h1>
		<p class="mb-8 font-mono text-xs text-fg-muted">
			dev tools &mdash; admin only
		</p>

		<!-- Seed data section -->
		<section class="border border-border p-4">
			<h2 class="mb-2 font-mono text-sm font-bold text-fg-dark">
				seed demo data
			</h2>
			<p class="mb-4 font-mono text-xs text-fg-muted">
				Clears all your existing tasks, sessions, and tags, then inserts fresh
				demo data: 10 tags, 20 tasks, and 10 sessions spread across the last 7
				days.
			</p>

			<button
				onclick={handleSeed}
				disabled={seeding}
				class="border border-yellow bg-transparent px-4 py-2 font-mono text-sm text-yellow transition-colors hover:bg-yellow hover:text-bg-dark disabled:cursor-not-allowed disabled:opacity-50"
			>
				{#if seeding}
					seeding...
				{:else}
					seed demo data
				{/if}
			</button>

			{#if result}
				<div class="mt-4 border border-green p-3">
					<p class="font-mono text-xs text-green">
						seeded {result.tags} tags, {result.tasks} tasks, {result.sessions}
						sessions
					</p>
				</div>
			{/if}

			{#if error}
				<div class="mt-4 border border-red p-3">
					<p class="font-mono text-xs text-red">{error}</p>
				</div>
			{/if}
		</section>
	</div>
{:else}
	<div class="flex h-full items-center justify-center p-8">
		<p class="animate-pulse font-mono text-sm text-fg-muted">loading...</p>
	</div>
{/if}
