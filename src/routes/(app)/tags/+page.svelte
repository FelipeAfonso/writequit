<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import TagBadge from '$lib/components/tags/TagBadge.svelte';

	const client = useConvexClient();
	const allTags = useQuery(api.tags.list, {});

	const TAG_TYPES = [
		{ value: undefined, label: 'none' },
		{ value: 'priority', label: 'priority' },
		{ value: 'project', label: 'project' },
		{ value: 'category', label: 'category' },
		{ value: 'context', label: 'context' }
	];

	async function handleTypeChange(tagId: string, type: string | undefined) {
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await client.mutation(api.tags.update, { id: tagId as any, type });
		} catch (error) {
			console.error('Failed to update tag:', error);
		}
	}

	async function handleDelete(tagId: string) {
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await client.mutation(api.tags.remove, { id: tagId as any });
		} catch (error) {
			console.error('Failed to delete tag:', error);
		}
	}
</script>

<svelte:head>
	<title>tags | :wq</title>
</svelte:head>

<div class="mx-auto flex max-w-3xl flex-col gap-6 p-6">
	<!-- Page header -->
	<div class="flex items-baseline gap-3">
		<h1 class="font-mono text-lg font-bold text-fg">
			<span class="text-fg-muted">+</span>
			tags
		</h1>
		{#if allTags.data}
			<span class="font-mono text-xs text-fg-muted">
				{allTags.data.length} tag{allTags.data.length !== 1 ? 's' : ''}
			</span>
		{/if}
	</div>

	<p class="font-mono text-xs text-fg-muted">
		Tags are created automatically when you use +tagname in a task. Here you can
		assign types and manage them.
	</p>

	{#if allTags.isLoading}
		<div class="py-8 text-center font-mono text-sm text-fg-muted">
			loading...
		</div>
	{:else if allTags.data && allTags.data.length === 0}
		<div class="py-8 text-center font-mono text-sm text-fg-muted">
			No tags yet. Create a task with +tagname to get started.
		</div>
	{:else if allTags.data}
		<div class="flex flex-col gap-px">
			{#each allTags.data as tag (tag._id)}
				<div
					class="flex items-center gap-4 border border-border bg-surface-0 px-3 py-2.5 font-mono"
				>
					<!-- Tag badge -->
					<div class="w-40">
						<TagBadge name={tag.name} color={tag.color} type={tag.type} />
					</div>

					<!-- Type selector -->
					<div class="flex items-center gap-1.5">
						<span class="text-xs text-fg-muted">type:</span>
						{#each TAG_TYPES as opt (opt.label)}
							<button
								type="button"
								class="border px-1.5 py-0.5 text-xs transition-colors"
								class:border-primary={tag.type === opt.value}
								class:text-primary={tag.type === opt.value}
								class:border-border={tag.type !== opt.value}
								class:text-fg-muted={tag.type !== opt.value}
								onclick={() => handleTypeChange(tag._id, opt.value)}
							>
								{opt.label}
							</button>
						{/each}
					</div>

					<!-- Delete button -->
					<button
						type="button"
						class="ml-auto border border-border px-1.5 py-0.5 text-xs text-fg-muted transition-colors hover:border-red hover:text-red"
						onclick={() => handleDelete(tag._id)}
					>
						:d
					</button>
				</div>
			{/each}
		</div>
	{/if}
</div>
