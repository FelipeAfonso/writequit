<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { getContext } from 'svelte';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { isEditableTarget } from '$lib/utils/keys';
	import { commandPalette } from '$lib/stores/commandPalette.svelte';
	import {
		formatTime,
		formatDate,
		formatDuration,
		TIMEZONE_CTX,
		type TimezoneGetter
	} from '$lib/utils/datetime';
	import TagBadge from '$lib/components/tags/TagBadge.svelte';
	import TaskStatusBadge from '$lib/components/tasks/TaskStatusBadge.svelte';

	const getTz = getContext<TimezoneGetter>(TIMEZONE_CTX);
	let timezone = $derived(getTz());
	const client = useConvexClient();

	let sessionId = $derived(page.params.id);

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const session = useQuery(api.sessions.get, () => ({ id: sessionId as any }));

	// All tasks for the task picker
	const allTasks = useQuery(api.tasks.list, {});

	let isRunning = $derived(session.data ? !session.data.endTime : false);
	let duration = $derived.by(() => {
		if (!session.data) return '';
		if (session.data.endTime) {
			return formatDuration(session.data.endTime - session.data.startTime);
		}
		return 'running';
	});

	// ── Actions ──

	async function handleDelete() {
		try {
			await client.mutation(api.sessions.remove, {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				id: sessionId as any
			});
			goto('/sessions');
		} catch (error) {
			console.error('Failed to delete session:', error);
		}
	}

	async function handleStop() {
		try {
			await client.mutation(api.sessions.stop, {});
		} catch (error) {
			console.error('Failed to stop session:', error);
		}
	}

	async function handleUnlinkTask(taskId: string) {
		try {
			await client.mutation(api.sessions.unlinkTask, {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				sessionId: sessionId as any,
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				taskId: taskId as any
			});
		} catch (error) {
			console.error('Failed to unlink task:', error);
		}
	}

	// ── Task picker ──

	let showTaskPicker = $state(false);
	let taskSearch = $state('');
	let taskSearchInput: HTMLInputElement | undefined = $state();

	/** Tasks available for linking (not already linked). */
	let linkableTasks = $derived.by(() => {
		if (!allTasks.data || !session.data) return [];
		const linkedIds = new Set(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(session.data as any).taskIds.map(String) as string[]
		);
		return allTasks.data.filter((t) => !linkedIds.has(String(t._id)));
	});

	/** Filtered by search query. */
	let filteredLinkable = $derived.by(() => {
		if (!taskSearch) return linkableTasks;
		const q = taskSearch.toLowerCase();
		return linkableTasks.filter((t) => t.title.toLowerCase().includes(q));
	});

	function openTaskPicker() {
		showTaskPicker = true;
		taskSearch = '';
		// Focus the search input after it renders
		setTimeout(() => taskSearchInput?.focus(), 0);
	}

	function closeTaskPicker() {
		showTaskPicker = false;
		taskSearch = '';
	}

	async function handleLinkTask(taskId: string) {
		try {
			await client.mutation(api.sessions.linkTask, {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				sessionId: sessionId as any,
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				taskId: taskId as any
			});
		} catch (error) {
			console.error('Failed to link task:', error);
		}
	}

	// ── Keyboard ──

	let pendingKey = $state('');
	let pendingTimer: ReturnType<typeof setTimeout> | undefined;

	function handleKeydown(e: KeyboardEvent) {
		if (isEditableTarget(e)) return;
		if (commandPalette.isOpen) return;

		if (pendingKey) {
			const combo = pendingKey + e.key;
			pendingKey = '';
			clearTimeout(pendingTimer);

			if (combo === 'dd') {
				e.preventDefault();
				handleDelete();
				return;
			}
		}

		if (e.key === 'd') {
			pendingKey = 'd';
			pendingTimer = setTimeout(() => {
				pendingKey = '';
			}, 500);
			return;
		}

		if (e.key === 'Backspace') {
			e.preventDefault();
			history.back();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="mx-auto flex max-w-3xl flex-col gap-6 p-6">
	<!-- Back link -->
	<a
		href="/sessions"
		class="inline-flex items-center gap-1 font-mono text-xs text-fg-muted transition-colors hover:text-fg-dark"
	>
		&lt;- back
		<span class="opacity-50">(Backspace)</span>
	</a>

	{#if session.isLoading}
		<div class="py-8 text-center font-mono text-sm text-fg-muted">
			loading...
		</div>
	{:else if session.data === null}
		<div class="py-8 text-center font-mono text-sm text-red">
			session not found
		</div>
	{:else if session.data}
		{@const s = session.data}

		<!-- Header -->
		<div class="flex flex-col gap-3">
			<div class="flex items-start justify-between gap-4">
				<h1 class="font-mono text-lg font-bold text-fg">
					{#if s.description}
						{s.description}
					{:else}
						<span class="text-fg-muted">untitled session</span>
					{/if}
				</h1>
				<div class="flex shrink-0 items-center gap-2">
					{#if isRunning}
						<button
							type="button"
							class="border border-orange px-2 py-1 font-mono text-xs text-orange transition-colors hover:bg-orange hover:text-bg-dark"
							onclick={handleStop}
						>
							:stop
						</button>
					{/if}
					<button
						type="button"
						class="border border-border px-2 py-1 font-mono text-xs text-red transition-colors hover:border-red hover:bg-red hover:text-bg-dark"
						onclick={handleDelete}
					>
						:d
					</button>
				</div>
			</div>

			<!-- Metadata bar -->
			<div
				class="flex flex-wrap items-center gap-3 border-b border-border pb-3"
			>
				<!-- Date -->
				<span class="font-mono text-xs text-fg-muted">
					{formatDate(s.startTime, timezone)}
				</span>

				<!-- Time range -->
				<span class="font-mono text-sm text-fg-dark">
					{formatTime(s.startTime, timezone)}-{s.endTime
						? formatTime(s.endTime, timezone)
						: '...'}
				</span>

				<!-- Duration -->
				<span
					class="font-mono text-sm font-bold"
					class:text-green={isRunning}
					class:text-fg={!isRunning}
				>
					{duration}
				</span>

				<!-- Tags -->
				{#if s.tags && s.tags.length > 0}
					{#each s.tags as tag (tag._id)}
						<TagBadge name={tag.name} color={tag.color} type={tag.type} />
					{/each}
				{/if}
			</div>
		</div>

		<!-- Linked tasks -->
		<div class="flex flex-col gap-3">
			<div class="flex items-center justify-between">
				<h2 class="font-mono text-sm font-bold text-fg-muted">
					linked tasks
					<span class="text-fg-gutter">({s.tasks ? s.tasks.length : 0})</span>
				</h2>
				<button
					type="button"
					class="border border-border px-2 py-1 font-mono text-xs text-fg-muted transition-colors hover:border-primary hover:text-primary"
					onclick={openTaskPicker}
				>
					+ link task
				</button>
			</div>

			<!-- Task picker -->
			{#if showTaskPicker}
				<div class="flex flex-col gap-2 border border-primary bg-surface-1 p-3">
					<div class="flex items-center gap-2">
						<span class="font-mono text-xs text-fg-muted">/</span>
						<input
							bind:this={taskSearchInput}
							bind:value={taskSearch}
							type="text"
							class="flex-1 border-none bg-transparent font-mono text-sm text-fg outline-none"
							placeholder="search tasks..."
							onkeydown={(e) => {
								if (e.key === 'Escape') {
									e.preventDefault();
									closeTaskPicker();
								}
							}}
						/>
						<button
							type="button"
							class="font-mono text-xs text-fg-muted transition-colors hover:text-red"
							onclick={closeTaskPicker}
						>
							[x]
						</button>
					</div>

					{#if filteredLinkable.length > 0}
						<div class="flex max-h-48 flex-col gap-1 overflow-y-auto">
							{#each filteredLinkable as task (task._id)}
								<button
									type="button"
									class="flex items-center gap-2 px-2 py-1.5 text-left font-mono text-sm text-fg-dark transition-colors hover:bg-surface-2 hover:text-fg"
									onclick={() => handleLinkTask(task._id)}
								>
									<TaskStatusBadge status={task.status} />
									<span class="min-w-0 truncate">{task.title}</span>
								</button>
							{/each}
						</div>
					{:else}
						<p class="py-2 text-center font-mono text-xs text-fg-muted">
							{taskSearch ? 'no matching tasks' : 'all tasks already linked'}
						</p>
					{/if}
				</div>
			{/if}

			{#if s.tasks && s.tasks.length > 0}
				<div class="flex flex-col gap-1">
					{#each s.tasks as task (task._id)}
						<div
							class="flex items-center gap-3 border border-border px-3 py-2 font-mono text-sm"
						>
							<TaskStatusBadge status={task.status} />
							<a
								href="/tasks/{task._id}"
								class="min-w-0 truncate text-fg-dark transition-colors hover:text-fg"
								class:line-through={task.status === 'done'}
								class:opacity-60={task.status === 'done'}
							>
								{task.title}
							</a>
							<button
								type="button"
								class="ml-auto shrink-0 font-mono text-xs text-fg-muted transition-colors hover:text-red"
								onclick={() => handleUnlinkTask(task._id)}
								title="Unlink task"
							>
								[x]
							</button>
						</div>
					{/each}
				</div>
			{:else if !showTaskPicker}
				<p class="font-mono text-xs text-fg-muted">
					No tasks linked to this session.
				</p>
			{/if}
		</div>
	{/if}
</div>
