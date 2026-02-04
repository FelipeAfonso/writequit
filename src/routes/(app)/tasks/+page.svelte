<script lang="ts">
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import TaskList from '$lib/components/tasks/TaskList.svelte';
	import TagFilter from '$lib/components/tags/TagFilter.svelte';

	type TaskStatus = 'inbox' | 'active' | 'done';

	const client = useConvexClient();

	let activeStatusFilter: TaskStatus | 'all' = $state('all');
	let activeTagIds = new SvelteSet<string>();

	/** Build query args based on the active status filter. */
	let queryArgs = $derived(
		activeStatusFilter === 'all'
			? {}
			: { status: activeStatusFilter as TaskStatus }
	);

	const tasks = useQuery(api.tasks.list, () => queryArgs);
	const allTags = useQuery(api.tags.list, {});

	let tagsMap = $derived.by(() => {
		const map = new SvelteMap<
			string,
			{ _id: string; name: string; color?: string; type?: string }
		>();
		if (allTags.data) {
			for (const tag of allTags.data) {
				map.set(tag._id, tag);
			}
		}
		return map;
	});

	/** Filter tasks by tags (client-side, inclusive/AND — must have ALL selected tags). */
	let filteredTasks = $derived.by(() => {
		if (!tasks.data) return [];
		if (activeTagIds.size === 0) return tasks.data;
		return tasks.data.filter((t: { tagIds: string[] }) =>
			[...activeTagIds].every((id) => t.tagIds.includes(id))
		);
	});

	function toggleTag(tagId: string) {
		if (activeTagIds.has(tagId)) {
			activeTagIds.delete(tagId);
		} else {
			activeTagIds.add(tagId);
		}
	}

	function clearTags() {
		activeTagIds.clear();
	}

	const statusOptions: {
		value: TaskStatus | 'all';
		label: string;
		icon: string;
	}[] = [
		{ value: 'all', label: 'all', icon: '~' },
		{ value: 'inbox', label: 'inbox', icon: '>' },
		{ value: 'active', label: 'active', icon: '*' },
		{ value: 'done', label: 'done', icon: 'x' }
	];

	function cycleFilter(direction: -1 | 1) {
		const currentIdx = statusOptions.findIndex(
			(o) => o.value === activeStatusFilter
		);
		const nextIdx =
			(currentIdx + direction + statusOptions.length) % statusOptions.length;
		activeStatusFilter = statusOptions[nextIdx].value;
	}

	async function handleStatusChange(id: string) {
		const task = tasks.data?.find((t: { _id: string }) => t._id === id);
		if (!task) return;

		const nextStatus: Record<string, TaskStatus> = {
			inbox: 'active',
			active: 'done',
			done: 'inbox'
		};

		try {
			await client.mutation(api.tasks.updateStatus, {
				id: id as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- Convex ID from string
				status: nextStatus[task.status]
			});
		} catch (error) {
			console.error('Failed to update status:', error);
		}
	}
</script>

<div class="mx-auto flex max-w-3xl flex-col gap-6 p-6">
	<!-- Page header -->
	<div class="flex items-baseline gap-3">
		<h1 class="font-mono text-lg font-bold text-fg">
			<span class="text-fg-muted">*</span>
			tasks
		</h1>
		{#if tasks.data}
			<span class="font-mono text-xs text-fg-muted">
				{filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''}
			</span>
		{/if}
	</div>

	<!-- Filters -->
	<div class="flex flex-col gap-3">
		<!-- Status filter -->
		<div class="flex items-center gap-1.5">
			{#each statusOptions as opt (opt.value)}
				<button
					type="button"
					class="border px-2 py-1 font-mono text-xs transition-colors"
					class:border-primary={activeStatusFilter === opt.value}
					class:text-primary={activeStatusFilter === opt.value}
					class:bg-surface-2={activeStatusFilter === opt.value}
					class:border-border={activeStatusFilter !== opt.value}
					class:text-fg-muted={activeStatusFilter !== opt.value}
					onclick={() => {
						activeStatusFilter = opt.value;
					}}
				>
					<span class="opacity-60">[{opt.icon}]</span>
					{opt.label}
				</button>
			{/each}
		</div>

		<!-- Tag filter -->
		{#if allTags.data && allTags.data.length > 0}
			<TagFilter
				tags={allTags.data}
				selectedTagIds={activeTagIds}
				ontoggle={toggleTag}
				onclear={clearTags}
			/>
		{/if}
	</div>

	<!-- Task list -->
	{#if tasks.isLoading}
		<div class="py-8 text-center font-mono text-sm text-fg-muted">
			loading...
		</div>
	{:else}
		<TaskList
			tasks={filteredTasks}
			{tagsMap}
			emptyMessage="No tasks match the current filters."
			ontaskclick={(id) => {
				window.location.href = `/tasks/${id}`;
			}}
			onstatuschange={handleStatusChange}
			onfilterprev={() => cycleFilter(-1)}
			onfilternext={() => cycleFilter(1)}
			tagIds={allTags.data?.map((t) => t._id) ?? []}
			ontagtoggle={(index) => {
				if (index === 0) {
					clearTags();
				} else {
					const tag = allTags.data?.[index - 1];
					if (tag) toggleTag(tag._id);
				}
			}}
		/>
	{/if}
</div>
