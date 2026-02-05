<script lang="ts">
	import { getContext } from 'svelte';
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { isEditableTarget } from '$lib/utils/keys';
	import { commandPalette } from '$lib/stores/commandPalette.svelte';
	import SessionCard from '$lib/components/sessions/SessionCard.svelte';
	import TagFilter from '$lib/components/tags/TagFilter.svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import {
		formatDateHeader,
		formatDuration,
		getDateRangeBounds,
		TIMEZONE_CTX,
		type TimezoneGetter
	} from '$lib/utils/datetime';

	const getTz = getContext<TimezoneGetter>(TIMEZONE_CTX);
	let timezone = $derived(getTz());

	// ── Date range filter ──
	type DateRange = 'week' | 'month' | 'all';
	let dateRange = $state<DateRange>('week');

	function computeDateRangeBounds(range: DateRange): {
		startAfter?: number;
		startBefore?: number;
	} {
		if (range === 'all') return {};
		return getDateRangeBounds(range, timezone);
	}

	let queryArgs = $derived(computeDateRangeBounds(dateRange));
	const sessions = useQuery(api.sessions.list, () => queryArgs);
	const allTags = useQuery(api.tags.list, {});

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

	function handleKeydown(e: KeyboardEvent) {
		if (commandPalette.isOpen) return;
		if (isEditableTarget(e)) return;

		if (e.key === 'j' || e.key === 'ArrowDown') {
			e.preventDefault();
			if (selectedIdx < flatSessions.length - 1) selectedIdx++;
		} else if (e.key === 'k' || e.key === 'ArrowUp') {
			e.preventDefault();
			if (selectedIdx > 0) selectedIdx--;
			else selectedIdx = 0;
		} else if (e.key === 'Enter' && selectedIdx >= 0) {
			e.preventDefault();
			const session = flatSessions[selectedIdx];
			if (session) {
				window.location.href = `/sessions/${session._id}`;
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

	<!-- Filters -->
	<div class="flex flex-col gap-3">
		<!-- Date range filter -->
		<div class="flex items-center gap-1.5">
			{#each dateOptions as opt (opt.value)}
				<button
					type="button"
					class="border px-2 py-1 font-mono text-xs transition-colors"
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
		{#if allTags.data && allTags.data.length > 0}
			<TagFilter
				tags={allTags.data}
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
						<SessionCard
							{session}
							selected={selectedIdx === getFlatIdx(session)}
							onclick={() => {
								window.location.href = `/sessions/${session._id}`;
							}}
						/>
					{/each}
				</div>
			{/each}
		</div>
	{/if}
</div>
