<script lang="ts">
	import TaskCard from './TaskCard.svelte';

	interface Tag {
		_id: string;
		name: string;
		color?: string;
		type?: string;
	}

	interface Task {
		_id: string;
		title: string;
		status: 'inbox' | 'active' | 'done';
		dueDate?: number;
		tagIds: string[];
		createdAt: number;
	}

	interface Props {
		tasks: Task[];
		/** Map of tagId -> tag document, for resolving tag display info. */
		tagsMap: Map<string, Tag>;
		/** Empty state message. */
		emptyMessage?: string;
		/** Called when a task is clicked. */
		ontaskclick?: (id: string) => void;
		/** Called when a task's status toggle is clicked. */
		onstatuschange?: (id: string) => void;
	}

	let {
		tasks,
		tagsMap,
		emptyMessage = 'No tasks found.',
		ontaskclick,
		onstatuschange
	}: Props = $props();

	/** Resolve tag IDs to tag objects using the provided map. */
	function resolveTags(tagIds: string[]): Tag[] {
		const resolved: Tag[] = [];
		for (const id of tagIds) {
			const tag = tagsMap.get(id);
			if (tag) resolved.push(tag);
		}
		return resolved;
	}
</script>

{#if tasks.length === 0}
	<div
		class="flex items-center justify-center py-12 font-mono text-sm text-fg-muted"
	>
		{emptyMessage}
	</div>
{:else}
	<div class="flex flex-col gap-px">
		{#each tasks as task (task._id)}
			<TaskCard
				id={task._id}
				title={task.title}
				status={task.status}
				dueDate={task.dueDate}
				tags={resolveTags(task.tagIds)}
				createdAt={task.createdAt}
				onclick={ontaskclick}
				{onstatuschange}
			/>
		{/each}
	</div>
{/if}
