<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import TaskEditor from '$lib/components/tasks/TaskEditor.svelte';
	import TaskList from '$lib/components/tasks/TaskList.svelte';

	const client = useConvexClient();
	const inboxTasks = useQuery(api.tasks.list, { status: 'inbox' });
	const allTags = useQuery(api.tags.list, {});

	/** Build a lookup map of tagId -> tag document. */
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

	async function handleCreateTask(rawContent: string) {
		try {
			await client.mutation(api.tasks.create, { rawContent });
		} catch (error) {
			console.error('Failed to create task:', error);
		}
	}

	/** Cycle status: inbox -> active -> done -> inbox */
	async function handleStatusChange(id: string) {
		const task = inboxTasks.data?.find((t: { _id: string }) => t._id === id);
		if (!task) return;

		const nextStatus: Record<string, 'inbox' | 'active' | 'done'> = {
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
			<span class="text-fg-muted">&gt;</span>
			inbox
		</h1>
		{#if inboxTasks.data}
			<span class="font-mono text-xs text-fg-muted">
				{inboxTasks.data.length} task{inboxTasks.data.length !== 1 ? 's' : ''}
			</span>
		{/if}
	</div>

	<!-- Task editor (the dump zone) -->
	<TaskEditor onsubmit={handleCreateTask} />

	<!-- Inbox task list -->
	{#if inboxTasks.isLoading}
		<div class="py-8 text-center font-mono text-sm text-fg-muted">
			loading...
		</div>
	{:else if inboxTasks.data}
		<TaskList
			tasks={inboxTasks.data}
			{tagsMap}
			emptyMessage="Inbox is empty. Type above to dump a task."
			ontaskclick={(id) => {
				window.location.href = `/tasks/${id}`;
			}}
			onstatuschange={handleStatusChange}
		/>
	{/if}
</div>
