<script lang="ts">
	import { goto } from '$app/navigation';
	import { getContext } from 'svelte';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { isEditableTarget } from '$lib/utils/keys';
	import { sortTags } from '$lib/utils/tags';
	import { commandPalette } from '$lib/stores/commandPalette.svelte';
	import SessionCard from '$lib/components/sessions/SessionCard.svelte';
	import TagFilter from '$lib/components/tags/TagFilter.svelte';
	import TagBadge from '$lib/components/tags/TagBadge.svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import {
		formatDateHeader,
		formatDuration,
		getDateRangeBounds,
		TIMEZONE_CTX,
		type TimezoneGetter
	} from '$lib/utils/datetime';

	let { data } = $props();

	const client = useConvexClient();
	const getTz = getContext<TimezoneGetter>(TIMEZONE_CTX);
	let timezone = $derived(getTz());

	// ── Date range filter ──
	type DateRange = 'week' | 'month' | 'all';
	let dateRange = $state<DateRange>('week');

	const DATE_RANGE_ORDER: DateRange[] = ['week', 'month', 'all'];

	function cycleDateRange(direction: -1 | 1) {
		const idx = DATE_RANGE_ORDER.indexOf(dateRange);
		const next = idx + direction;
		if (next >= 0 && next < DATE_RANGE_ORDER.length) {
			dateRange = DATE_RANGE_ORDER[next];
		}
	}

	function computeDateRangeBounds(range: DateRange): {
		startAfter?: number;
		startBefore?: number;
	} {
		if (range === 'all') return {};
		return getDateRangeBounds(range, timezone);
	}

	let queryArgs = $derived(computeDateRangeBounds(dateRange));
	const sessions = useQuery(
		api.sessions.list,
		() => queryArgs,
		() => ({ initialData: data.preloaded?.sessions })
	);
	const allTags = useQuery(api.tags.list, {}, () => ({
		initialData: data.preloaded?.tags
	}));

	// Active session query
	const activeSession = useQuery(api.sessions.active, {}, () => ({
		initialData: data.preloaded?.activeSession
	}));

	let sortedTags = $derived(allTags.data ? sortTags(allTags.data) : []);

	// ── Tag filter ──
	let activeTagIds = $state<string[]>([]);
	let activeTagSet = $derived(new SvelteSet(activeTagIds));

	function toggleTag(tagId: string) {
		if (activeTagIds.includes(tagId)) {
			activeTagIds = activeTagIds.filter((id) => id !== tagId);
		} else {
			activeTagIds = [...activeTagIds, tagId];
		}
	}

	function clearTags() {
		activeTagIds = [];
	}

	// ── Filter sessions by tag ──
	interface SessionData {
		_id: string;
		startTime: number;
		endTime?: number;
		description?: string;
		tagIds: string[];
		taskIds: string[];
		tags: { _id: string; name: string; color?: string; type?: string }[];
	}

	let filteredSessions = $derived.by(() => {
		if (!sessions.data) return [];
		if (activeTagIds.length === 0) return sessions.data as SessionData[];
		return (sessions.data as SessionData[]).filter((s) =>
			activeTagIds.every((id) => s.tagIds.includes(id))
		);
	});

	// ── Group sessions by day ──
	interface DayGroup {
		date: string; // e.g. "2026-02-04"
		label: string; // e.g. "Tue, Feb 4"
		totalMs: number;
		sessions: SessionData[];
	}

	let grouped = $derived.by(() => {
		const groups = new SvelteMap<string, DayGroup>();

		for (const session of filteredSessions) {
			const { date, label } = formatDateHeader(session.startTime, timezone);

			if (!groups.has(date)) {
				groups.set(date, { date, label, totalMs: 0, sessions: [] });
			}

			const group = groups.get(date)!;
			group.sessions.push(session);

			if (session.endTime) {
				group.totalMs += session.endTime - session.startTime;
			}
		}

		// Sort groups by date descending
		return [...groups.values()].sort((a, b) => b.date.localeCompare(a.date));
	});

	// ── Keyboard navigation ──
	let selectedIdx = $state(-1);

	// Flat list of all sessions for keyboard nav
	let flatSessions = $derived(grouped.flatMap((g) => g.sessions));

	// Two-key sequence tracking (for gg, dd, t N)
	let lastKey = $state('');
	let lastKeyTime = $state(0);
	const SEQ_TIMEOUT = 500;

	function checkSequence(key: string): string | null {
		const now = Date.now();
		if (now - lastKeyTime < SEQ_TIMEOUT && lastKey) {
			const seq = lastKey + key;
			lastKey = '';
			lastKeyTime = 0;
			return seq;
		}
		lastKey = key;
		lastKeyTime = now;
		return null;
	}

	// ── Quick-start form state ──
	let descriptionInput: HTMLInputElement | undefined = $state();
	let startDescription = $state('');
	let startTagIds = $state<string[]>([]);
	let startTagSet = $derived(new SvelteSet(startTagIds));
	let isStarting = $state(false);

	function toggleStartTag(tagId: string) {
		if (startTagIds.includes(tagId)) {
			startTagIds = startTagIds.filter((id) => id !== tagId);
		} else {
			startTagIds = [...startTagIds, tagId];
		}
	}

	function focusStartForm() {
		descriptionInput?.focus();
	}

	async function handleStart() {
		if (isStarting) return;
		isStarting = true;

		// Resolve tag names from IDs
		const tagNames = startTagIds
			.map((id) => sortedTags.find((t) => t._id === id)?.name)
			.filter((n): n is string => !!n);

		try {
			await client.mutation(api.sessions.start, {
				description: startDescription.trim() || undefined,
				tags: tagNames
			});
			// Reset form
			startDescription = '';
			startTagIds = [];
		} catch {
			// Handled by Convex error reporting
		} finally {
			isStarting = false;
		}
	}

	// ── Active timer elapsed ──
	let elapsed = $state('00:00:00');
	let intervalId: ReturnType<typeof setInterval> | undefined;

	function formatElapsed(ms: number): string {
		const totalSeconds = Math.floor(ms / 1000);
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;
		return [hours, minutes, seconds]
			.map((n) => String(n).padStart(2, '0'))
			.join(':');
	}

	function updateElapsed() {
		const session = activeSession.data;
		if (!session) return;
		elapsed = formatElapsed(Date.now() - session.startTime);
	}

	$effect(() => {
		if (activeSession.data) {
			updateElapsed();
			intervalId = setInterval(updateElapsed, 1000);
		} else {
			elapsed = '00:00:00';
		}

		return () => {
			if (intervalId !== undefined) {
				clearInterval(intervalId);
				intervalId = undefined;
			}
		};
	});

	let isStopping = $state(false);

	async function handleStop() {
		if (isStopping) return;
		isStopping = true;
		try {
			await client.mutation(api.sessions.stop, {});
		} catch {
			// Handled by Convex error reporting
		} finally {
			isStopping = false;
		}
	}

	// ── Delete session ──
	let deleteConfirmId = $state<string | null>(null);

	async function deleteSession(sessionId: string) {
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await client.mutation(api.sessions.remove, { id: sessionId as any });
			if (selectedIdx >= flatSessions.length - 1) {
				selectedIdx = Math.max(0, flatSessions.length - 2);
			}
		} catch {
			// Handled by Convex error reporting
		}
		deleteConfirmId = null;
	}

	// ── Register command palette actions ──
	$effect(() => {
		commandPalette.registerActions({
			focusEditor: () => focusStartForm()
		});
		return () => {
			commandPalette.unregisterActions(['focusEditor']);
		};
	});

	// ── Keyboard handling ──
	function handleKeydown(e: KeyboardEvent) {
		if (commandPalette.isOpen) return;
		if (isEditableTarget(e)) return;

		// Delete confirmation: Enter to confirm, any other key to cancel
		if (deleteConfirmId !== null) {
			e.preventDefault();
			if (e.key === 'Enter') {
				deleteSession(deleteConfirmId);
			} else {
				deleteConfirmId = null;
			}
			return;
		}

		const key = e.key;

		// Check two-key sequences
		const seq = checkSequence(key);
		if (seq) {
			if (seq === 'gg') {
				e.preventDefault();
				selectedIdx = flatSessions.length > 0 ? 0 : -1;
				return;
			}
			if (seq === 'dd' && selectedIdx >= 0) {
				e.preventDefault();
				const session = flatSessions[selectedIdx];
				if (session) {
					deleteConfirmId = session._id;
				}
				return;
			}
			// t + number: toggle tag filter
			if (seq.startsWith('t') && seq.length === 2) {
				const n = seq[1];
				if (n === '0') {
					e.preventDefault();
					clearTags();
					return;
				}
				const idx = parseInt(n, 10) - 1;
				if (idx >= 0 && idx < sortedTags.length) {
					e.preventDefault();
					toggleTag(sortedTags[idx]._id);
					return;
				}
			}
		}

		// Single-key handling (these must not fire if they're the
		// start of a two-key sequence, but we track lastKey above)
		if (key === 'j' || key === 'ArrowDown') {
			e.preventDefault();
			if (selectedIdx < flatSessions.length - 1) selectedIdx++;
		} else if (key === 'k' || key === 'ArrowUp') {
			e.preventDefault();
			if (selectedIdx > 0) selectedIdx--;
			else selectedIdx = 0;
		} else if (key === 'Enter' && selectedIdx >= 0) {
			e.preventDefault();
			const session = flatSessions[selectedIdx];
			if (session) {
				goto(`/app/sessions/${session._id}`);
			}
		} else if (key === 'G') {
			e.preventDefault();
			selectedIdx = flatSessions.length > 0 ? flatSessions.length - 1 : -1;
		} else if (key === 'h' || key === 'ArrowLeft') {
			e.preventDefault();
			cycleDateRange(-1);
		} else if (key === 'l' || key === 'ArrowRight') {
			e.preventDefault();
			cycleDateRange(1);
		} else if (key === 's') {
			e.preventDefault();
			if (!activeSession.data) {
				focusStartForm();
			}
		}
	}

	// ── Total for filtered range ──
	let totalMs = $derived(grouped.reduce((acc, g) => acc + g.totalMs, 0));

	const dateOptions: { value: DateRange; label: string }[] = [
		{ value: 'week', label: 'this week' },
		{ value: 'month', label: 'this month' },
		{ value: 'all', label: 'all time' }
	];
</script>

<svelte:head>
	<title>sessions | :wq</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="mx-auto flex max-w-3xl flex-col gap-6 p-6">
	<!-- Page header -->
	<div class="flex items-baseline gap-3">
		<h1 class="font-mono text-lg font-bold text-fg">
			<span class="text-fg-muted">~</span>
			sessions
		</h1>
		{#if filteredSessions.length > 0}
			<span class="font-mono text-xs text-fg-muted">
				{filteredSessions.length} session{filteredSessions.length !== 1
					? 's'
					: ''}
				&middot; {formatDuration(totalMs)} total
			</span>
		{/if}
	</div>

	<!-- Quick-start / Active timer panel -->
	<div class="border border-border bg-surface-1 p-4">
		{#if activeSession.data}
			<!-- Active timer display -->
			<div class="flex flex-col gap-3">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-3">
						<span class="inline-block h-2 w-2 animate-pulse bg-red"></span>
						<span class="font-mono text-lg font-bold text-green">
							{elapsed}
						</span>
					</div>
					<button
						type="button"
						class="cursor-pointer border border-red px-3 py-1 font-mono text-xs text-red transition-colors hover:bg-red hover:text-bg"
						disabled={isStopping}
						onclick={handleStop}
					>
						:stop
					</button>
				</div>
				{#if activeSession.data.description}
					<p class="font-mono text-sm text-fg-dark">
						{activeSession.data.description}
					</p>
				{/if}
				{#if activeSession.data.tags && activeSession.data.tags.length > 0}
					<div class="flex flex-wrap gap-1.5">
						{#each activeSession.data.tags as tag (tag._id)}
							<TagBadge
								name={tag.name}
								color={tag.color}
								type={tag.type}
								active={true}
							/>
						{/each}
					</div>
				{/if}
				{#if activeSession.data.taskIds.length > 0}
					<span class="font-mono text-xs text-fg-muted">
						{activeSession.data.taskIds.length} task{activeSession.data.taskIds
							.length !== 1
							? 's'
							: ''} linked
					</span>
				{/if}
			</div>
		{:else}
			<!-- Start form -->
			<div class="flex flex-col gap-3">
				<div class="flex items-center gap-2">
					<span class="font-mono text-xs text-fg-muted">:start</span>
					<span class="font-mono text-xs text-fg-muted opacity-50">
						press <kbd
							class="border border-border bg-surface-2 px-1 py-0.5 text-primary"
						>
							s
						</kbd>
						to focus
					</span>
				</div>
				<div class="flex gap-2">
					<input
						bind:this={descriptionInput}
						bind:value={startDescription}
						type="text"
						placeholder="what are you working on?"
						class="flex-1 border border-border bg-bg px-3 py-1.5 font-mono text-sm text-fg placeholder:text-fg-muted/50 focus:border-primary focus:outline-none"
						onkeydown={(e) => {
							if (e.key === 'Enter') {
								e.preventDefault();
								handleStart();
							}
							if (e.key === 'Escape') {
								e.preventDefault();
								descriptionInput?.blur();
							}
						}}
					/>
					<button
						type="button"
						class="cursor-pointer border border-green bg-bg px-4 py-1.5 font-mono text-xs text-green transition-colors hover:bg-green hover:text-bg disabled:opacity-50"
						disabled={isStarting}
						onclick={handleStart}
					>
						start
					</button>
				</div>
				{#if sortedTags.length > 0}
					<div class="flex flex-wrap items-center gap-1.5">
						{#each sortedTags as tag (tag._id)}
							<TagBadge
								name={tag.name}
								color={tag.color}
								type={tag.type}
								active={startTagSet.has(tag._id)}
								onclick={() => toggleStartTag(tag._id)}
							/>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Filters -->
	<div class="flex flex-col gap-3">
		<!-- Date range filter -->
		<div class="flex items-center gap-1.5">
			{#each dateOptions as opt (opt.value)}
				<button
					type="button"
					class="cursor-pointer border px-2 py-1 font-mono text-xs transition-colors"
					class:border-primary={dateRange === opt.value}
					class:text-primary={dateRange === opt.value}
					class:bg-surface-2={dateRange === opt.value}
					class:border-border={dateRange !== opt.value}
					class:text-fg-muted={dateRange !== opt.value}
					onclick={() => {
						dateRange = opt.value;
					}}
				>
					{opt.label}
				</button>
			{/each}
		</div>

		<!-- Tag filter -->
		{#if sortedTags.length > 0}
			<TagFilter
				tags={sortedTags}
				selectedTagIds={activeTagSet}
				ontoggle={toggleTag}
				onclear={clearTags}
			/>
		{/if}
	</div>

	<!-- Sessions list grouped by day -->
	{#if sessions.isLoading}
		<div class="py-8 text-center font-mono text-sm text-fg-muted">
			loading...
		</div>
	{:else if grouped.length === 0}
		<div class="py-8 text-center font-mono text-sm text-fg-muted">
			No sessions yet. Use <span class="text-primary">:start</span>
			or
			<span class="text-primary">:log</span>
			to track time.
		</div>
	{:else}
		{@const getFlatIdx = (session: SessionData) =>
			flatSessions.indexOf(session)}
		<div class="flex flex-col gap-4">
			{#each grouped as group (group.date)}
				<!-- Day header -->
				<div class="flex items-baseline justify-between">
					<h2 class="font-mono text-xs font-bold text-fg-muted">
						{group.label}
					</h2>
					<span class="font-mono text-xs text-green">
						{formatDuration(group.totalMs)}
					</span>
				</div>

				<!-- Sessions in this day -->
				<div class="flex flex-col gap-1">
					{#each group.sessions as session (session._id)}
						{@const flatIdx = getFlatIdx(session)}
						<div class="relative">
							<SessionCard
								{session}
								selected={selectedIdx === flatIdx}
								href="/app/sessions/{session._id}"
							/>
							{#if deleteConfirmId === session._id}
								<div
									class="absolute inset-0 flex items-center justify-center border border-red bg-bg/95 font-mono text-sm"
								>
									<span class="text-red">
										delete? press
										<kbd
											class="border border-red bg-surface-2 px-1.5 py-0.5 text-red"
										>
											Enter
										</kbd>
										to confirm
									</span>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/each}
		</div>
	{/if}
</div>
