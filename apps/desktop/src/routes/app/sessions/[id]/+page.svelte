<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { getContext } from 'svelte';
	import {
		getDataProvider,
		commandPalette,
		isEditableTarget,
		formatTime,
		formatDate,
		formatDuration,
		getLocalMidnight,
		parseHHMM,
		buildTimestamp,
		TIMEZONE_CTX,
		type TimezoneGetter
	} from '@writequit/ui';
	import TagBadge from '@writequit/ui/components/tags/TagBadge.svelte';
	import TaskStatusBadge from '@writequit/ui/components/tasks/TaskStatusBadge.svelte';

	const getTz = getContext<TimezoneGetter>(TIMEZONE_CTX);
	let timezone = $derived(getTz());
	const provider = getDataProvider();

	// Route param is always present in a [id] route
	let sessionId = $derived(page.params.id as string);

	const session = $derived(provider.sessions.get(sessionId));
	const allTasks = $derived(provider.tasks.list());

	let isRunning = $derived(session.current ? !session.current.endTime : false);
	let duration = $derived.by(() => {
		if (!session.current) return '';
		if (session.current.endTime) {
			return formatDuration(
				session.current.endTime - session.current.startTime
			);
		}
		return 'running';
	});

	// ── Inline editing ──

	type EditField = 'description' | 'startTime' | 'endTime' | 'tags';
	const FIELD_ORDER: EditField[] = [
		'description',
		'startTime',
		'endTime',
		'tags'
	];

	let isEditing = $state(false);
	let activeField = $state<EditField | null>(null);

	// Draft values for each field
	let draftDescription = $state('');
	let draftStartTime = $state('');
	let draftEndTime = $state('');
	let draftTags = $state('');

	// Input refs for focusing
	let descriptionInput: HTMLInputElement | undefined = $state();
	let startTimeInput: HTMLInputElement | undefined = $state();
	let endTimeInput: HTMLInputElement | undefined = $state();
	let tagsInput: HTMLInputElement | undefined = $state();

	/** Get the input element for a given field. */
	function getInputRef(field: EditField): HTMLInputElement | undefined {
		switch (field) {
			case 'description':
				return descriptionInput;
			case 'startTime':
				return startTimeInput;
			case 'endTime':
				return endTimeInput;
			case 'tags':
				return tagsInput;
		}
	}

	/** Get the available editable fields (endTime excluded for running sessions). */
	let editableFields = $derived.by(() => {
		if (isRunning) {
			return FIELD_ORDER.filter((f) => f !== 'endTime');
		}
		return FIELD_ORDER;
	});

	/** Populate draft values from the current session data. */
	function populateDrafts() {
		if (!session.current) return;
		const s = session.current;
		draftDescription = s.description ?? '';
		draftStartTime = formatTime(s.startTime, timezone);
		draftEndTime = s.endTime ? formatTime(s.endTime, timezone) : '';
		draftTags = s.tags
			? s.tags.map((t: { name: string }) => `+${t.name}`).join(' ')
			: '';
	}

	/** Enter edit mode, optionally focusing a specific field. */
	function enterEditMode(field?: EditField) {
		populateDrafts();
		isEditing = true;
		const target = field ?? editableFields[0];
		activeField = target;
		setTimeout(() => getInputRef(target)?.focus(), 0);
	}

	/** Exit edit mode without saving the current field. */
	function exitEditMode() {
		isEditing = false;
		activeField = null;
	}

	/** Move to the next editable field. Wraps around. */
	function focusNextField() {
		if (!activeField) return;
		const idx = editableFields.indexOf(activeField);
		const next = editableFields[(idx + 1) % editableFields.length];
		activeField = next;
		setTimeout(() => getInputRef(next)?.focus(), 0);
	}

	/** Move to the previous editable field. Wraps around. */
	function focusPrevField() {
		if (!activeField) return;
		const idx = editableFields.indexOf(activeField);
		const prev =
			editableFields[(idx - 1 + editableFields.length) % editableFields.length];
		activeField = prev;
		setTimeout(() => getInputRef(prev)?.focus(), 0);
	}

	/** Save a single field's draft value to the backend. */
	async function saveField(field: EditField) {
		if (!session.current) return;
		const s = session.current;

		try {
			switch (field) {
				case 'description': {
					const desc = draftDescription.trim() || undefined;
					if (desc !== (s.description ?? undefined)) {
						await provider.sessions.update(s.id, {
							description: desc ?? ''
						});
					}
					break;
				}
				case 'startTime': {
					const mins = parseHHMM(draftStartTime);
					if (mins === null) {
						// Revert to original
						draftStartTime = formatTime(s.startTime, timezone);
						break;
					}
					const midnight = getLocalMidnight(s.startTime, timezone);
					const newStart = buildTimestamp(midnight, mins);
					if (newStart !== s.startTime) {
						await provider.sessions.update(s.id, {
							startTime: newStart
						});
					}
					break;
				}
				case 'endTime': {
					if (!s.endTime) break;
					const mins = parseHHMM(draftEndTime);
					if (mins === null) {
						// Revert to original
						draftEndTime = formatTime(s.endTime, timezone);
						break;
					}
					const midnight = getLocalMidnight(s.endTime, timezone);
					const newEnd = buildTimestamp(midnight, mins);
					if (newEnd !== s.endTime) {
						await provider.sessions.update(s.id, {
							endTime: newEnd
						});
					}
					break;
				}
				case 'tags': {
					// Parse +tag syntax
					const tagNames = draftTags
						.split(/\s+/)
						.map((t) => t.replace(/^\+/, '').trim())
						.filter((t) => t.length > 0);
					const currentTagNames = s.tags
						? s.tags.map((t: { name: string }) => t.name)
						: [];
					// Only update if tags changed
					const changed =
						tagNames.length !== currentTagNames.length ||
						tagNames.some((t: string, i: number) => t !== currentTagNames[i]);
					if (changed) {
						await provider.sessions.update(s.id, {
							tags: tagNames
						});
					}
					break;
				}
			}
		} catch (error) {
			console.error(`Failed to update ${field}:`, error);
		}
	}

	/** Handle Enter on a field: save and move to next, or exit if last. */
	async function handleFieldEnter(field: EditField) {
		await saveField(field);
		const idx = editableFields.indexOf(field);
		if (idx < editableFields.length - 1) {
			focusNextField();
		} else {
			exitEditMode();
		}
	}

	/** Handle Escape on a field: revert draft and exit edit mode. */
	function handleFieldEscape() {
		populateDrafts();
		exitEditMode();
	}

	/** Handle keydown on an editable field input. */
	function handleFieldKeydown(field: EditField, e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			handleFieldEnter(field);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			handleFieldEscape();
		} else if (e.key === 'Tab') {
			e.preventDefault();
			// Save current field first, then navigate
			saveField(field);
			if (e.shiftKey) {
				focusPrevField();
			} else {
				focusNextField();
			}
		}
	}

	// ── Actions ──

	async function handleDelete() {
		if (!session.current) return;
		try {
			await provider.sessions.remove(session.current.id);
			goto('/app/sessions');
		} catch (error) {
			console.error('Failed to delete session:', error);
		}
	}

	async function handleStop() {
		try {
			await provider.sessions.stop();
		} catch (error) {
			console.error('Failed to stop session:', error);
		}
	}

	async function handleUnlinkTask(taskId: string) {
		if (!session.current) return;
		try {
			await provider.sessions.unlinkTask(session.current.id, taskId);
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
		if (!allTasks.current || !session.current) return [];
		const linkedIds = new Set(session.current.taskIds.map(String));
		return allTasks.current.filter((t) => !linkedIds.has(String(t.id)));
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
		if (!session.current) return;
		try {
			await provider.sessions.linkTask(session.current.id, taskId);
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
				enterEditMode();
				return;
			}
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
	}
</script>

<svelte:head>
	<title>{session.current?.description ?? 'session'} | :wq</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="mx-auto flex max-w-3xl flex-col gap-6 p-6">
	<!-- Back link -->
	<a
		href="/app/sessions"
		class="inline-flex cursor-pointer items-center gap-1 font-mono text-xs text-fg-muted transition-colors hover:text-fg-dark"
	>
		&lt;- back
		<span class="opacity-50">(Backspace)</span>
	</a>

	{#if session.isLoading}
		<div class="py-8 text-center font-mono text-sm text-fg-muted">
			loading...
		</div>
	{:else if session.current === null}
		<div class="py-8 text-center font-mono text-sm text-red">
			session not found
		</div>
	{:else if session.current}
		{@const s = session.current}

		<!-- Header -->
		<div class="flex flex-col gap-3">
			<div class="flex items-start justify-between gap-4">
				<!-- Description: inline editable -->
				{#if isEditing && activeField === 'description'}
					<input
						bind:this={descriptionInput}
						bind:value={draftDescription}
						type="text"
						class="flex-1 border border-primary bg-bg-dark px-2 py-1 font-mono text-lg font-bold text-fg outline-none"
						placeholder="session description..."
						onkeydown={(e) => handleFieldKeydown('description', e)}
						onblur={() => {
							saveField('description');
						}}
					/>
				{:else if isEditing}
					<button
						type="button"
						class="cursor-pointer text-left font-mono text-lg font-bold text-fg"
						onclick={() => {
							activeField = 'description';
							setTimeout(() => descriptionInput?.focus(), 0);
						}}
					>
						{#if s.description}
							{s.description}
						{:else}
							<span class="text-fg-muted">untitled session</span>
						{/if}
						<span class="ml-2 text-xs text-fg-gutter">[edit]</span>
					</button>
				{:else}
					<h1 class="font-mono text-lg font-bold text-fg">
						{#if s.description}
							{s.description}
						{:else}
							<span class="text-fg-muted">untitled session</span>
						{/if}
					</h1>
				{/if}

				<div class="flex shrink-0 items-center gap-2">
					<!-- Edit toggle -->
					<button
						type="button"
						class="cursor-pointer border border-border px-2 py-1 font-mono text-xs text-fg-muted transition-colors hover:border-border-highlight hover:text-fg-dark"
						onclick={() => {
							if (isEditing) {
								exitEditMode();
							} else {
								enterEditMode();
							}
						}}
					>
						{isEditing ? ':q' : ':e'}
					</button>

					{#if isRunning}
						<button
							type="button"
							class="cursor-pointer border border-orange px-2 py-1 font-mono text-xs text-orange transition-colors hover:bg-orange hover:text-bg-dark"
							onclick={handleStop}
						>
							:stop
						</button>
					{/if}
					<button
						type="button"
						class="cursor-pointer border border-border px-2 py-1 font-mono text-xs text-red transition-colors hover:border-red hover:bg-red hover:text-bg-dark"
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
				<!-- Date (read-only) -->
				<span class="font-mono text-xs text-fg-muted">
					{formatDate(s.startTime, timezone)}
				</span>

				<!-- Start time: inline editable -->
				{#if isEditing && activeField === 'startTime'}
					<input
						bind:this={startTimeInput}
						bind:value={draftStartTime}
						type="text"
						class="w-16 border border-primary bg-bg-dark px-1 py-0.5 text-center font-mono text-sm text-fg-dark outline-none"
						placeholder="HH:MM"
						onkeydown={(e) => handleFieldKeydown('startTime', e)}
						onblur={() => {
							saveField('startTime');
						}}
					/>
				{:else}
					<button
						type="button"
						class="font-mono text-sm transition-colors"
						class:text-fg-dark={!isEditing}
						class:text-primary={isEditing}
						class:cursor-pointer={isEditing}
						class:cursor-default={!isEditing}
						disabled={!isEditing}
						onclick={() => {
							if (isEditing) {
								activeField = 'startTime';
								setTimeout(() => startTimeInput?.focus(), 0);
							}
						}}
					>
						{formatTime(s.startTime, timezone)}
					</button>
				{/if}

				<span class="font-mono text-sm text-fg-muted">-</span>

				<!-- End time: inline editable (only for completed sessions) -->
				{#if isRunning}
					<span class="font-mono text-sm text-fg-muted">...</span>
				{:else if isEditing && activeField === 'endTime'}
					<input
						bind:this={endTimeInput}
						bind:value={draftEndTime}
						type="text"
						class="w-16 border border-primary bg-bg-dark px-1 py-0.5 text-center font-mono text-sm text-fg-dark outline-none"
						placeholder="HH:MM"
						onkeydown={(e) => handleFieldKeydown('endTime', e)}
						onblur={() => {
							saveField('endTime');
						}}
					/>
				{:else}
					<button
						type="button"
						class="font-mono text-sm transition-colors"
						class:text-fg-dark={!isEditing}
						class:text-primary={isEditing}
						class:cursor-pointer={isEditing}
						class:cursor-default={!isEditing}
						disabled={!isEditing}
						onclick={() => {
							if (isEditing) {
								activeField = 'endTime';
								setTimeout(() => endTimeInput?.focus(), 0);
							}
						}}
					>
						{s.endTime ? formatTime(s.endTime, timezone) : '...'}
					</button>
				{/if}

				<!-- Duration -->
				<span
					class="font-mono text-sm font-bold"
					class:text-green={isRunning}
					class:text-fg={!isRunning}
				>
					{duration}
				</span>

				<!-- Tags: inline editable -->
				{#if isEditing && activeField === 'tags'}
					<input
						bind:this={tagsInput}
						bind:value={draftTags}
						type="text"
						class="min-w-32 flex-1 border border-primary bg-bg-dark px-1 py-0.5 font-mono text-xs text-teal outline-none"
						placeholder="+tag1 +tag2"
						onkeydown={(e) => handleFieldKeydown('tags', e)}
						onblur={() => {
							saveField('tags');
						}}
					/>
				{:else if s.tags && s.tags.length > 0}
					<button
						type="button"
						class="inline-flex items-center gap-1 transition-opacity"
						class:cursor-pointer={isEditing}
						class:cursor-default={!isEditing}
						class:hover:opacity-80={isEditing}
						disabled={!isEditing}
						onclick={() => {
							if (isEditing) {
								activeField = 'tags';
								setTimeout(() => tagsInput?.focus(), 0);
							}
						}}
					>
						{#each s.tags as tag (tag.id)}
							<TagBadge name={tag.name} color={tag.color} type={tag.type} />
						{/each}
						{#if isEditing}
							<span class="ml-1 text-xs text-fg-gutter">[edit]</span>
						{/if}
					</button>
				{:else if isEditing}
					<button
						type="button"
						class="cursor-pointer font-mono text-xs text-fg-gutter transition-colors hover:text-teal"
						onclick={() => {
							activeField = 'tags';
							setTimeout(() => tagsInput?.focus(), 0);
						}}
					>
						+add tags
					</button>
				{/if}
			</div>

			<!-- Editing hint -->
			{#if isEditing}
				<div class="font-mono text-xs text-fg-gutter">
					Enter save &middot; Tab next &middot; Escape cancel
				</div>
			{/if}
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
					class="cursor-alias border border-border px-2 py-1 font-mono text-xs text-fg-muted transition-colors hover:border-primary hover:text-primary"
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
							class="cursor-pointer font-mono text-xs text-fg-muted transition-colors hover:text-red"
							onclick={closeTaskPicker}
						>
							[x]
						</button>
					</div>

					{#if filteredLinkable.length > 0}
						<div class="flex max-h-48 flex-col gap-1 overflow-y-auto">
							{#each filteredLinkable as task (task.id)}
								<button
									type="button"
									class="flex cursor-alias items-center gap-2 px-2 py-1.5 text-left font-mono text-sm text-fg-dark transition-colors hover:bg-surface-2 hover:text-fg"
									onclick={() => handleLinkTask(task.id)}
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
					{#each s.tasks as task (task.id)}
						<div
							class="flex items-center gap-3 border border-border px-3 py-2 font-mono text-sm"
						>
							<TaskStatusBadge status={task.status} />
							<a
								href="/app/tasks/{task.id}"
								class="min-w-0 cursor-pointer truncate text-fg-dark transition-colors hover:text-fg"
								class:line-through={task.status === 'done'}
								class:opacity-60={task.status === 'done'}
							>
								{task.title}
							</a>
							<button
								type="button"
								class="ml-auto shrink-0 cursor-pointer font-mono text-xs text-fg-muted transition-colors hover:text-red"
								onclick={() => handleUnlinkTask(task.id)}
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
