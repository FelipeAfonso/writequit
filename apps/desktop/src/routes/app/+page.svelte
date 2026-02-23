<script lang="ts">
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import {
		getDataProvider,
		commandPalette,
		settings,
		isEditableTarget,
		sortTags
	} from '@writequit/ui';
	import type { TaskStatus } from '@writequit/ui';
	import TaskEditor from '@writequit/ui/components/tasks/TaskEditor.svelte';
	import TaskList from '@writequit/ui/components/tasks/TaskList.svelte';
	import TagFilter from '@writequit/ui/components/tags/TagFilter.svelte';
	import ConfirmDialog from '@writequit/ui/components/ui/ConfirmDialog.svelte';

	const provider = getDataProvider();

	let editor: TaskEditor | undefined = $state();
	let selectedTaskId = $state<string | undefined>(undefined);
	let deleteTargetId = $state<string | undefined>(undefined);
	let showDeleteConfirm = $state(false);

	// ── Search (local, not URL-driven) ────────────────────────────
	let searchQuery = $state('');
	let isSearching = $derived(searchQuery.length > 0);

	// ── User settings ─────────────────────────────────────────────
	const userSettings = provider.settings.get();

	// Apply server defaults to the local settings once on load
	$effect(() => {
		if (userSettings.current) {
			settings.applyServerDefaults(userSettings.current);
		}
	});

	let viMode = $derived(userSettings.current?.viMode ?? false);

	// ── Command palette actions ───────────────────────────────────
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
			searchQuery = '';
			return;
		}

		if (e.key === 'i') {
			e.preventDefault();
			editor?.focus();
		}
	}

	// ── Data ──────────────────────────────────────────────────────
	const allTasks = provider.tasks.list();
	const allTagsReactive = provider.tags.list();

	/** Reactive Set view of the persisted tag IDs. */
	let activeTagIds = $derived(new SvelteSet(settings.activeTagIds));

	/** Tags mapped with _id for web components compatibility. */
	let tagsWithLegacyId = $derived.by(() => {
		const tags = allTagsReactive.current ?? [];
		return tags.map((t) => ({
			...t,
			_id: t.id
		}));
	});

	let sortedTags = $derived(
		allTagsReactive.current ? sortTags(tagsWithLegacyId) : []
	);

	let tagsMap = $derived.by(() => {
		const map = new SvelteMap<
			string,
			{ _id: string; name: string; color?: string; type?: string }
		>();
		for (const tag of tagsWithLegacyId) {
			map.set(tag._id, tag);
		}
		return map;
	});

	/** Filter tasks by status. */
	let statusFilteredTasks = $derived.by(() => {
		const tasks = allTasks.current ?? [];
		if (settings.statusFilter === 'all') return tasks;
		return tasks.filter((t) => t.status === settings.statusFilter);
	});

	/** Filter by search query. */
	let searchFilteredTasks = $derived.by(() => {
		if (!isSearching) return statusFilteredTasks;
		const q = searchQuery.toLowerCase();
		return statusFilteredTasks.filter(
			(t) =>
				t.title.toLowerCase().includes(q) ||
				t.rawContent.toLowerCase().includes(q)
		);
	});

	/** Filter tasks by tags (client-side, AND — must have ALL selected tags). */
	let filteredTasks = $derived.by(() => {
		if (activeTagIds.size === 0) return searchFilteredTasks;
		return searchFilteredTasks.filter((t) =>
			[...activeTagIds].every((id) => t.tagIds.includes(id))
		);
	});

	/** Map tasks to include _id for web component compatibility. */
	let mappedTasks = $derived(
		filteredTasks.map((t) => ({
			...t,
			_id: t.id,
			tagIds: t.tagIds
		}))
	);

	// ── Tag toggling ──────────────────────────────────────────────

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
					.map((t) => t._id)
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

	// ── Status filter ─────────────────────────────────────────────

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

	// ── Actions ───────────────────────────────────────────────────

	async function handleCreateTask(rawContent: string) {
		try {
			await provider.tasks.create(rawContent);
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
			await provider.tasks.remove(deleteTargetId);
		} catch (error) {
			console.error('Failed to delete task:', error);
		}
		deleteTargetId = undefined;
	}

	async function handleStatusChange(id: string) {
		const task = (allTasks.current ?? []).find((t) => t.id === id);
		if (!task) return;

		const nextStatus: Record<string, TaskStatus> = {
			inbox: 'active',
			active: 'done',
			done: 'inbox'
		};

		try {
			await provider.tasks.updateStatus(id, nextStatus[task.status]);
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
				onclick={() => {
					searchQuery = '';
				}}
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
	{#if allTasks.isLoading}
		<div class="py-8 text-center font-mono text-sm text-fg-muted">
			loading...
		</div>
	{:else}
		<TaskList
			tasks={mappedTasks}
			{tagsMap}
			emptyMessage={isSearching
				? `no tasks matching "${searchQuery}"`
				: 'No tasks yet. Type above to dump a task.'}
			ontaskclick={(id: string) => {
				window.location.href = `/app/tasks/${id}`;
			}}
			onstatuschange={handleStatusChange}
			onfilterprev={() => cycleFilter(-1)}
			onfilternext={() => cycleFilter(1)}
			tagIds={sortedTags.map((t) => t._id)}
			ontagtoggle={(index: number) => {
				if (index === 0) {
					clearTags();
				} else {
					const tag = sortedTags[index - 1];
					if (tag) toggleTag(tag._id);
				}
			}}
			onselect={(id: string | undefined) => {
				selectedTaskId = id;
			}}
			ondelete={handleDeleteTask}
			onedit={(id: string) => {
				window.location.href = `/app/tasks/${id}?edit=1`;
			}}
			paginationStatus="Exhausted"
			onloadmore={() => {}}
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
