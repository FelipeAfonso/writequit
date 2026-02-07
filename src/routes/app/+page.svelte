<script lang="ts">
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { isEditableTarget } from '$lib/utils/keys';
	import { sortTags } from '$lib/utils/tags';
	import { settings } from '$lib/stores/settings.svelte';
	import { commandPalette } from '$lib/stores/commandPalette.svelte';
	import { usePaginatedQuery } from '$lib/stores/usePaginatedQuery.svelte';
	import TaskEditor from '$lib/components/tasks/TaskEditor.svelte';
	import TaskList from '$lib/components/tasks/TaskList.svelte';
	import TagFilter from '$lib/components/tags/TagFilter.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';

	let { data } = $props();

	let editor: TaskEditor | undefined = $state();
	let searchQuery = $state('');
	let selectedTaskId = $state<string | undefined>(undefined);
	let deleteTargetId = $state<string | undefined>(undefined);
	let showDeleteConfirm = $state(false);

	// ── Server-side user settings ──────────────────────────────────
	const userSettings = useQuery(api.users.getSettings, {});

	// Apply server defaults to the local settings once on load
	$effect(() => {
		if (userSettings.data) {
			settings.applyServerDefaults(userSettings.data);
		}
	});

	let viMode = $derived(userSettings.data?.viMode ?? false);

	// Register page-specific command actions
	$effect(() => {
		commandPalette.registerActions({
			focusEditor: () => editor?.focus(),
			setSearch: (query: string) => {
				searchQuery = query;
			},
			editorSubmit: () => editor?.submit() ?? false,
			editorBlur: () => editor?.blur(),
			getCurrentTaskId: () => selectedTaskId
		});

		return () => {
			commandPalette.unregisterActions([
				'focusEditor',
				'setSearch',
				'editorSubmit',
				'editorBlur',
				'getCurrentTaskId'
			]);
		};
	});

	function handleKeydown(e: KeyboardEvent) {
		if (isEditableTarget(e)) return;
		if (showDeleteConfirm) return;

		// Clear search with Escape
		if (e.key === 'Escape' && searchQuery) {
			e.preventDefault();
			searchQuery = '';
			return;
		}

		if (e.key === 'i') {
			e.preventDefault();
			editor?.focus();
		}
	}

	type TaskStatus = 'inbox' | 'active' | 'done';

	const client = useConvexClient();

	/** Reactive Set view of the persisted tag IDs. */
	let activeTagIds = $derived(new SvelteSet(settings.activeTagIds));

	const PAGE_SIZE = 10;

	/** Build query args based on the active status filter. */
	let queryArgs = $derived(
		settings.statusFilter === 'all'
			? {}
			: { status: settings.statusFilter as TaskStatus }
	);

	const tasks = usePaginatedQuery(api.tasks.listPaginated, () => queryArgs, {
		initialNumItems: PAGE_SIZE
	});
	const allTags = useQuery(api.tags.list, {}, () => ({
		initialData: data.preloaded?.tags
	}));

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

	let sortedTags = $derived(allTags.data ? sortTags(allTags.data) : []);

	/** Filter tasks by tags (client-side, inclusive/AND — must have ALL selected tags). */
	let tagFiltered = $derived.by(() => {
		if (activeTagIds.size === 0) return tasks.results;
		return tasks.results.filter((t: { tagIds: string[] }) =>
			[...activeTagIds].every((id) => t.tagIds.includes(id))
		);
	});

	/** Further filter by search query (case-insensitive title match). */
	let searchFiltered = $derived.by(() => {
		if (!searchQuery) return tagFiltered;
		const q = searchQuery.toLowerCase();
		return tagFiltered.filter(
			(t: { title: string; rawContent: string }) =>
				t.title.toLowerCase().includes(q) ||
				t.rawContent.toLowerCase().includes(q)
		);
	});

	/** Backend already sorts by status priority, so no client-side sort needed. */
	let filteredTasks = $derived(searchFiltered);

	function toggleTag(tagId: string) {
		const ids = settings.activeTagIds;
		if (ids.includes(tagId)) {
			settings.activeTagIds = ids.filter((id) => id !== tagId);
		} else {
			settings.activeTagIds = [...ids, tagId];
		}
	}

	function clearTags() {
		settings.activeTagIds = [];
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
			(o) => o.value === settings.statusFilter
		);
		const nextIdx =
			(currentIdx + direction + statusOptions.length) % statusOptions.length;
		settings.statusFilter = statusOptions[nextIdx].value;
	}

	async function handleCreateTask(rawContent: string) {
		try {
			await client.mutation(api.tasks.create, { rawContent });
		} catch (error) {
			console.error('Failed to create task:', error);
		}
	}

	function handleDeleteTask(id: string) {
		deleteTargetId = id;
		showDeleteConfirm = true;
	}

	async function confirmDelete() {
		showDeleteConfirm = false;
		if (!deleteTargetId) return;
		try {
			await client.mutation(api.tasks.remove, {
				id: deleteTargetId as any // eslint-disable-line @typescript-eslint/no-explicit-any -- Convex ID from string
			});
		} catch (error) {
			console.error('Failed to delete task:', error);
		}
		deleteTargetId = undefined;
	}

	async function handleStatusChange(id: string) {
		const task = tasks.results.find((t: { _id: string }) => t._id === id);
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

<svelte:head>
	<title>tasks | :wq</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="mx-auto flex max-w-3xl flex-col gap-6 p-6">
	<!-- Page header -->
	<div class="flex items-baseline gap-3">
		<h1 class="font-mono text-lg font-bold text-fg">
			<span class="text-fg-muted">#</span>
			tasks
		</h1>
	</div>

	<!-- Search indicator -->
	{#if searchQuery}
		<div
			class="flex items-center gap-2 border border-border-highlight bg-surface-1 px-3 py-1.5"
		>
			<span class="font-mono text-xs text-fg-muted">/</span>
			<span class="font-mono text-sm text-primary">{searchQuery}</span>
			<button
				type="button"
				class="ml-auto font-mono text-xs text-fg-muted transition-colors hover:text-red"
				onclick={() => (searchQuery = '')}
			>
				[x] clear
				<kbd
					class="ml-1 border border-border bg-surface-2 px-1.5 py-0.5 text-fg-muted"
				>
					Esc
				</kbd>
			</button>
		</div>
	{/if}

	<!-- Task editor (the dump zone) -->
	<TaskEditor
		bind:this={editor}
		onsubmit={handleCreateTask}
		autofocus={false}
		{viMode}
		tags={sortedTags}
	/>

	<!-- Filters -->
	<div class="flex flex-col gap-3">
		<!-- Status filter -->
		<div class="flex items-center gap-1.5">
			{#each statusOptions as opt (opt.value)}
				<button
					type="button"
					class="border px-2 py-1 font-mono text-xs transition-colors"
					class:border-primary={settings.statusFilter === opt.value}
					class:text-primary={settings.statusFilter === opt.value}
					class:bg-surface-2={settings.statusFilter === opt.value}
					class:border-border={settings.statusFilter !== opt.value}
					class:text-fg-muted={settings.statusFilter !== opt.value}
					onclick={() => {
						settings.statusFilter = opt.value;
					}}
				>
					<span class="opacity-60">[{opt.icon}]</span>
					{opt.label}
				</button>
			{/each}
		</div>

		<!-- Tag filter -->
		{#if sortedTags.length > 0}
			<TagFilter
				tags={sortedTags}
				selectedTagIds={activeTagIds}
				ontoggle={toggleTag}
				onclear={clearTags}
			/>
		{/if}
	</div>

	<!-- Task list -->
	{#if tasks.status === 'LoadingFirstPage'}
		<div class="py-8 text-center font-mono text-sm text-fg-muted">
			loading...
		</div>
	{:else}
		<TaskList
			tasks={filteredTasks}
			{tagsMap}
			emptyMessage="No tasks yet. Type above to dump a task."
			ontaskclick={(id) => {
				window.location.href = `/app/tasks/${id}`;
			}}
			onstatuschange={handleStatusChange}
			onfilterprev={() => cycleFilter(-1)}
			onfilternext={() => cycleFilter(1)}
			tagIds={sortedTags.map((t) => t._id)}
			ontagtoggle={(index) => {
				if (index === 0) {
					clearTags();
				} else {
					const tag = sortedTags[index - 1];
					if (tag) toggleTag(tag._id);
				}
			}}
			onselect={(id) => {
				selectedTaskId = id;
			}}
			ondelete={handleDeleteTask}
			onedit={(id) => {
				window.location.href = `/app/tasks/${id}?edit=1`;
			}}
			paginationStatus={tasks.status}
			onloadmore={() => tasks.loadMore(PAGE_SIZE)}
		/>
	{/if}
</div>

<ConfirmDialog
	open={showDeleteConfirm}
	message="delete this task?"
	onconfirm={confirmDelete}
	oncancel={() => {
		showDeleteConfirm = false;
		deleteTargetId = undefined;
	}}
/>
