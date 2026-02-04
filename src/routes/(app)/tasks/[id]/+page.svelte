<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { isEditableTarget } from '$lib/utils/keys';
	import TaskEditor from '$lib/components/tasks/TaskEditor.svelte';
	import TaskStatusBadge from '$lib/components/tasks/TaskStatusBadge.svelte';
	import TagBadge from '$lib/components/tags/TagBadge.svelte';

	const client = useConvexClient();

	let taskId = $derived(page.params.id);

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const task = useQuery(api.tasks.get, () => ({ id: taskId as any }));

	let isEditing = $state(false);

	/** Format a UTC ms timestamp. */
	function formatDate(ms: number): string {
		const d = new Date(ms);
		const year = d.getUTCFullYear();
		const month = String(d.getUTCMonth() + 1).padStart(2, '0');
		const day = String(d.getUTCDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	function formatDateTime(ms: number): string {
		const d = new Date(ms);
		const date = formatDate(ms);
		const hours = String(d.getUTCHours()).padStart(2, '0');
		const minutes = String(d.getUTCMinutes()).padStart(2, '0');
		return `${date} ${hours}:${minutes}`;
	}

	async function handleUpdate(rawContent: string) {
		try {
			await client.mutation(api.tasks.update, {
				id: taskId as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- Convex ID from route param
				rawContent
			});
			isEditing = false;
		} catch (error) {
			console.error('Failed to update task:', error);
		}
	}

	async function handleStatusCycle() {
		if (!task.data) return;
		const nextStatus: Record<string, 'inbox' | 'active' | 'done'> = {
			inbox: 'active',
			active: 'done',
			done: 'inbox'
		};

		try {
			await client.mutation(api.tasks.updateStatus, {
				id: taskId as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- Convex ID from route param
				status: nextStatus[task.data.status]
			});
		} catch (error) {
			console.error('Failed to update status:', error);
		}
	}

	async function handleDelete() {
		try {
			await client.mutation(api.tasks.remove, { id: taskId as any }); // eslint-disable-line @typescript-eslint/no-explicit-any -- Convex ID from route param
			goto('/');
		} catch (error) {
			console.error('Failed to delete task:', error);
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (isEditableTarget(e)) return;

		if (e.key === 'Backspace' || e.key === 'h' || e.key === 'ArrowLeft') {
			e.preventDefault();
			history.back();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="mx-auto flex max-w-3xl flex-col gap-6 p-6">
	<!-- Back link -->
	<a
		href="/"
		class="inline-flex items-center gap-1 font-mono text-xs text-fg-muted transition-colors hover:text-fg-dark"
	>
		&lt;- back
		<span class="opacity-50">(Backspace)</span>
	</a>

	{#if task.isLoading}
		<div class="py-8 text-center font-mono text-sm text-fg-muted">
			loading...
		</div>
	{:else if task.data === null}
		<div class="py-8 text-center font-mono text-sm text-red">
			task not found
		</div>
	{:else if task.data}
		<!-- Header -->
		<div class="flex flex-col gap-3">
			<div class="flex items-start justify-between gap-4">
				<h1 class="font-mono text-lg font-bold text-fg">
					{task.data.title}
				</h1>
				<div class="flex shrink-0 items-center gap-2">
					<button
						type="button"
						class="border border-border px-2 py-1 font-mono text-xs text-fg-muted transition-colors hover:border-border-highlight hover:text-fg-dark"
						onclick={() => {
							isEditing = !isEditing;
						}}
					>
						{isEditing ? ':q' : ':e'}
					</button>
					<button
						type="button"
						class="border border-border px-2 py-1 font-mono text-xs text-red transition-colors hover:border-red hover:bg-red hover:text-bg-dark"
						onclick={handleDelete}
					>
						:d
					</button>
				</div>
			</div>

			<!-- Status + metadata bar -->
			<div
				class="flex flex-wrap items-center gap-3 border-b border-border pb-3"
			>
				<button
					type="button"
					class="transition-opacity hover:opacity-80"
					onclick={handleStatusCycle}
					title="Cycle status"
				>
					<TaskStatusBadge status={task.data.status} />
				</button>

				{#if task.data.dueDate}
					<span class="font-mono text-xs text-warning">
						due:{formatDate(task.data.dueDate)}
					</span>
				{/if}

				{#if task.data.tags && task.data.tags.length > 0}
					{#each task.data.tags as tag (tag._id)}
						<TagBadge name={tag.name} color={tag.color} type={tag.type} />
					{/each}
				{/if}

				<span class="ml-auto font-mono text-xs text-fg-muted">
					created {formatDateTime(task.data.createdAt)}
				</span>
			</div>
		</div>

		<!-- Editor or content display -->
		{#if isEditing}
			<TaskEditor
				initialContent={task.data.rawContent}
				onsubmit={handleUpdate}
				placeholder="Edit your task..."
				autofocus={true}
			/>
		{:else}
			<!-- Raw markdown content display -->
			<div
				class="font-mono text-sm leading-relaxed whitespace-pre-wrap text-fg-dark"
			>
				{task.data.rawContent}
			</div>
		{/if}
	{/if}
</div>
