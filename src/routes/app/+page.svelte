<script lang="ts">
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { isEditableTarget } from '$lib/utils/keys';
	import { sortTags } from '$lib/utils/tags';
	import { compareTasks } from '$lib/utils/taskSort';
	import { settings } from '$lib/stores/settings.svelte';
	import { commandPalette } from '$lib/stores/commandPalette.svelte';
	import { usePaginatedQuery } from '$lib/stores/usePaginatedQuery.svelte';
	import { useAuthState } from '$lib/auth';
	import TaskEditor from '$lib/components/tasks/TaskEditor.svelte';
	import TaskList from '$lib/components/tasks/TaskList.svelte';
	import TagFilter from '$lib/components/tags/TagFilter.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';

	let { data } = $props();

	const auth = useAuthState();

	let editor: TaskEditor | undefined = $state();
	let selectedTaskId = $state<string | undefined>(undefined);
	let deleteTargetId = $state<string | undefined>(undefined);
	let showDeleteConfirm = $state(false);

	// ── Search (URL-driven via ?q= param, fetched server-side) ─────
	let searchQuery = $derived(data.searchQuery ?? '');
	let isSearching = $derived(searchQuery.length > 0);

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
			editorSubmit: () => editor?.submit() ?? false,
			editorBlur: () => editor?.blur(),
			getCurrentTaskId: () => selectedTaskId
		});

		return () => {
			commandPalette.unregisterActions([
				'focusEditor',
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
		if (e.key === 'Escape' && isSearching) {
			e.preventDefault();
			goto('/app');
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
	let statusArg = $derived(
		settings.statusFilter === 'all'
			? undefined
			: (settings.statusFilter as TaskStatus)
	);

	// Paginated query — skipped when searching or when auth hasn't completed yet.
	// Without the auth guard, the query fires before setAuth() completes in
	// production (slower network), returning empty results.
	const tasks = usePaginatedQuery(
		api.tasks.listPaginated,
		() =>
			isSearching || !auth.isAuthenticated
				? 'skip'
				: statusArg
					? { status: statusArg }
					: {},
		{ initialNumItems: PAGE_SIZE }
	);

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

	/**
	 * Pick the right result set: server search results, preloaded tasks
	 * (while the paginated subscription is still connecting), or live
	 * paginated results.
	 */
	let baseResults = $derived(
		isSearching
			? (data.searchResults ?? [])
			: tasks.status === 'LoadingFirstPage'
				? (data.preloaded?.tasks ?? [])
				: tasks.results
	);

	/** Whether we're showing preloaded (non-live) task data. */
	let isShowingPreloaded = $derived(
		!isSearching &&
			tasks.status === 'LoadingFirstPage' &&
			(data.preloaded?.tasks?.length ?? 0) > 0
	);

	/** Filter tasks by tags (client-side, inclusive/AND — must have ALL selected tags). */
	let filteredTasks = $derived.by(() => {
		if (activeTagIds.size === 0) return baseResults;
		return baseResults.filter((t: { tagIds: string[] }) =>
			[...activeTagIds].every((id) => t.tagIds.includes(id))
		);
	});

	/** Tag lookup callback for the shared sort comparator. */
	function getTag(id: string) {
		return tagsMap.get(id);
	}

	/**
	 * Sort tasks: active/inbox by priority tag (p0 first, then p1 …),
	 * done tasks by completion date (most recent first). Active tasks
	 * always appear above inbox.  Uses the shared comparator from taskSort.
	 */
	let sortedTasks = $derived.by(() => {
		return [...filteredTasks].sort((a: any, b: any) =>
			compareTasks(a, b, getTag)
		);
	});

	// ── Auto-load for tag filtering ──────────────────────────────────
	// When tag filters are active and the visible (filtered) results are
	// fewer than a full page, automatically load more pages until we have
	// enough results or exhaust the data. This prevents the scenario
	// where matching tasks are deeper in the list and not yet loaded.
	const MAX_AUTO_LOADS = 20; // safety cap: ~200 tasks max
	let autoLoadCount = $state(0);

	// Reset the counter whenever the tag selection changes
	$effect(() => {
		void activeTagIds.size; // track dependency
		autoLoadCount = 0;
	});

	// Auto-load effect — self-throttling via the CanLoadMore guard
	$effect(() => {
		if (activeTagIds.size === 0) return;
		if (isShowingPreloaded) return;
		if (tasks.status !== 'CanLoadMore') return;
		if (filteredTasks.length >= PAGE_SIZE) return;
		if (autoLoadCount >= MAX_AUTO_LOADS) return;

		autoLoadCount++;
		tasks.loadMore(PAGE_SIZE);
	});

	/** True while we're still fetching more pages to satisfy a tag filter. */
	let isAutoLoadingForTags = $derived(
		activeTagIds.size > 0 &&
			filteredTasks.length < PAGE_SIZE &&
			autoLoadCount < MAX_AUTO_LOADS &&
			!isSearching &&
			!isShowingPreloaded &&
			(tasks.status === 'CanLoadMore' || tasks.status === 'LoadingMore')
	);

	function toggleTag(tagId: string) {
		const ids = settings.activeTagIds;

		// If already selected, just deselect it
		if (ids.includes(tagId)) {
			settings.activeTagIds = ids.filter((id) => id !== tagId);
			return;
		}

		// Enforce single-select for priority and project tag types:
		// selecting one deselects any other of the same type.
		const tag = sortedTags.find((t) => t._id === tagId);
		const tagType = tag?.type;

		if (tagType === 'priority' || tagType === 'project') {
			const sameTypeIds = new Set<string>(
				sortedTags
					.filter((t) => t.type === tagType && t._id !== tagId)
					.map((t) => t._id as string)
			);
			settings.activeTagIds = [
				...ids.filter((id) => !sameTypeIds.has(id)),
				tagId
			];
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
		const task = baseResults.find((t: { _id: string }) => t._id === id);
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
	{#if isSearching}
		<div
			class="flex items-center gap-2 border border-border-highlight bg-surface-1 px-3 py-1.5"
		>
			<span class="font-mono text-xs text-fg-muted">/</span>
			<span class="font-mono text-sm text-primary">{searchQuery}</span>
			<button
				type="button"
				class="ml-auto cursor-pointer font-mono text-xs text-fg-muted transition-colors hover:text-red"
				onclick={() => goto('/app')}
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
					class="cursor-pointer border px-2 py-1 font-mono text-xs transition-colors"
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
	{#if !isSearching && tasks.status === 'LoadingFirstPage' && !data.preloaded?.tasks?.length}
		<div class="py-8 text-center font-mono text-sm text-fg-muted">
			loading...
		</div>
	{:else}
		<TaskList
			tasks={sortedTasks}
			{tagsMap}
			emptyMessage={isSearching
				? `no tasks matching "${searchQuery}"`
				: isAutoLoadingForTags
					? 'filtering...'
					: 'No tasks yet. Type above to dump a task.'}
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
				goto(`/app/tasks/${id}?edit=1`);
			}}
			paginationStatus={isSearching
				? 'Exhausted'
				: isShowingPreloaded
					? 'Exhausted'
					: isAutoLoadingForTags
						? 'LoadingMore'
						: tasks.status}
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
