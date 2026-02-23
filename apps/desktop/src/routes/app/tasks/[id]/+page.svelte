<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { getContext } from 'svelte';
	import {
		getDataProvider,
		commandPalette,
		isEditableTarget,
		formatDate,
		formatDateTime,
		TIMEZONE_CTX,
		type TimezoneGetter
	} from '@writequit/ui';
	import TaskEditor from '@writequit/ui/components/tasks/TaskEditor.svelte';
	import TaskStatusBadge from '@writequit/ui/components/tasks/TaskStatusBadge.svelte';
	import TagBadge from '@writequit/ui/components/tags/TagBadge.svelte';
	import Markdown from '@writequit/ui/components/ui/Markdown.svelte';
	import ConfirmDialog from '@writequit/ui/components/ui/ConfirmDialog.svelte';

	const provider = getDataProvider();
	const getTz = getContext<TimezoneGetter>(TIMEZONE_CTX);
	let timezone = $derived(getTz());

	// Route param is always present in a [id] route
	let taskId = $derived(page.params.id as string);

	const task = $derived(provider.tasks.get(taskId));
	const allTags = provider.tags.list();
	const userSettings = provider.settings.get();
	let viMode = $derived(userSettings.current?.viMode ?? false);

	// Check for ?edit=1 URL param to start in edit mode (e.g. from cc on task list)
	let isEditing = $state(page.url.searchParams.get('edit') === '1');
	let editor: TaskEditor | undefined = $state();
	let showDeleteConfirm = $state(false);

	// Register page-specific command actions
	$effect(() => {
		commandPalette.registerActions({
			getCurrentTaskId: () => taskId
		});

		return () => {
			commandPalette.unregisterActions(['getCurrentTaskId']);
		};
	});

	// Register editor commands when editing
	$effect(() => {
		if (isEditing && editor) {
			commandPalette.registerActions({
				editorSubmit: () => editor?.submit() ?? false,
				editorBlur: () => editor?.blur(),
				navigateBack: () => goto('/app')
			});
			return () => {
				commandPalette.unregisterActions([
					'editorSubmit',
					'editorBlur',
					'navigateBack'
				]);
			};
		}
	});

	async function handleUpdate(rawContent: string) {
		const oldId = taskId;
		try {
			await provider.tasks.update(taskId, rawContent);
			isEditing = false;
			// The slug may have changed (derived from title).
			// Re-fetch by old id — if the task moved, it'll be null,
			// so we need to figure out the new id from the content.
			// For now, we stay on the page; the reactive `task` will
			// update if the id is still valid. If the slug changed,
			// the provider's update returns void, but the old id is
			// no longer valid. Navigate to /app and let the user
			// find the task with the new slug.
			const updated = provider.tasks.get(oldId);
			// Give reactivity a tick to settle
			await new Promise((r) => setTimeout(r, 50));
			if (updated.current === null) {
				// Slug changed — go back to task list
				goto('/app');
			}
		} catch (error) {
			console.error('Failed to update task:', error);
		}
	}

	async function handleStatusCycle() {
		if (!task.current) return;
		const nextStatus: Record<string, 'inbox' | 'active' | 'done'> = {
			inbox: 'active',
			active: 'done',
			done: 'inbox'
		};

		try {
			await provider.tasks.updateStatus(
				taskId,
				nextStatus[task.current.status]
			);
		} catch (error) {
			console.error('Failed to update status:', error);
		}
	}

	function handleDelete() {
		showDeleteConfirm = true;
	}

	async function confirmDelete() {
		showDeleteConfirm = false;
		try {
			await provider.tasks.remove(taskId);
			goto('/app');
		} catch (error) {
			console.error('Failed to delete task:', error);
		}
	}

	// Two-key sequence state for dd / cc
	let pendingKey = $state('');
	let pendingTimer: ReturnType<typeof setTimeout> | undefined;

	function handleKeydown(e: KeyboardEvent) {
		if (isEditableTarget(e)) return;
		if (commandPalette.isOpen) return;
		if (showDeleteConfirm) return;

		// Second key of a two-key sequence
		if (pendingKey) {
			const combo = pendingKey + e.key;
			pendingKey = '';
			clearTimeout(pendingTimer);

			if (combo === 'dd') {
				e.preventDefault();
				handleDelete();
				return;
			}
			if (combo === 'cc') {
				e.preventDefault();
				if (isEditing) {
					editor?.focus();
				} else {
					isEditing = true;
				}
				return;
			}
			// Unknown combo — fall through
		}

		// Start a two-key sequence
		if (e.key === 'd' || e.key === 'c') {
			pendingKey = e.key;
			pendingTimer = setTimeout(() => {
				pendingKey = '';
			}, 500);
			return;
		}

		if (e.key === 'Backspace') {
			e.preventDefault();
			history.back();
		}

		if (e.key === 'i' && isEditing && editor) {
			e.preventDefault();
			editor.focus();
		}
	}
</script>

<svelte:head>
	<title>{task.current?.title ?? 'task'} | :wq</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="mx-auto flex max-w-3xl flex-col gap-6 p-6">
	<!-- Back link -->
	<a
		href="/app"
		class="inline-flex cursor-pointer items-center gap-1 font-mono text-xs text-fg-muted transition-colors hover:text-fg-dark"
	>
		&lt;- back
		<span class="opacity-50">(Backspace)</span>
	</a>

	{#if task.isLoading}
		<div class="py-8 text-center font-mono text-sm text-fg-muted">
			loading...
		</div>
	{:else if task.current === null}
		<div class="py-8 text-center font-mono text-sm text-red">
			task not found
		</div>
	{:else if task.current}
		<!-- Header -->
		<div class="flex flex-col gap-3">
			<div class="flex items-start justify-between gap-4">
				<h1 class="font-mono text-lg font-bold text-fg">
					{task.current.title}
				</h1>
				<div class="flex shrink-0 items-center gap-2">
					<button
						type="button"
						class="cursor-pointer border border-border px-2 py-1 font-mono text-xs text-fg-muted transition-colors hover:border-border-highlight hover:text-fg-dark"
						onclick={() => {
							isEditing = !isEditing;
						}}
					>
						{isEditing ? ':q' : ':e'}
					</button>
					<button
						type="button"
						class="cursor-pointer border border-border px-2 py-1 font-mono text-xs text-red transition-colors hover:border-red hover:bg-red hover:text-bg-dark"
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
					class="cursor-pointer transition-opacity hover:opacity-80"
					onclick={handleStatusCycle}
					title="Cycle status"
				>
					<TaskStatusBadge status={task.current.status} />
				</button>

				{#if task.current.dueDate}
					<span class="font-mono text-xs text-warning">
						due:{formatDate(task.current.dueDate, timezone)}
					</span>
				{/if}

				{#if task.current.tags && task.current.tags.length > 0}
					{#each task.current.tags as tag (tag.id)}
						<TagBadge name={tag.name} color={tag.color} type={tag.type} />
					{/each}
				{/if}

				<span class="ml-auto font-mono text-xs text-fg-muted">
					created {formatDateTime(task.current.createdAt, timezone)}
				</span>
			</div>
		</div>

		<!-- Editor or content display -->
		{#if isEditing}
			<TaskEditor
				bind:this={editor}
				initialContent={task.current.rawContent}
				onsubmit={handleUpdate}
				placeholder="Edit your task..."
				autofocus={true}
				{viMode}
				tags={(allTags.current ?? []).map((t) => ({
					...t,
					_id: t.id
				}))}
			/>
		{:else}
			<Markdown content={task.current.rawContent} />
		{/if}
	{/if}
</div>

<ConfirmDialog
	open={showDeleteConfirm}
	message="delete this task?"
	onconfirm={confirmDelete}
	oncancel={() => (showDeleteConfirm = false)}
/>
