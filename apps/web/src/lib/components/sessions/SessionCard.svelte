<script lang="ts">
	import { getContext } from 'svelte';
	import TagBadge from '$lib/components/tags/TagBadge.svelte';
	import {
		formatTime,
		formatDuration,
		TIMEZONE_CTX,
		type TimezoneGetter
	} from '$lib/utils/datetime';

	interface Tag {
		_id: string;
		name: string;
		color?: string;
		type?: string;
	}

	interface SessionData {
		startTime: number;
		endTime?: number;
		description?: string;
		taskIds: string[];
		tags: Tag[];
	}

	interface Props {
		session: SessionData;
		selected?: boolean;
		onclick?: () => void;
	}

	let { session, selected = false, onclick }: Props = $props();

	const getTz = getContext<TimezoneGetter>(TIMEZONE_CTX);
	let timezone = $derived(getTz());

	let duration = $derived(
		session.endTime
			? formatDuration(session.endTime - session.startTime)
			: 'running'
	);

	let timeRange = $derived(
		session.endTime
			? `${formatTime(session.startTime, timezone)}-${formatTime(session.endTime, timezone)}`
			: `${formatTime(session.startTime, timezone)}-...`
	);

	let isRunning = $derived(!session.endTime);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
	class="flex cursor-pointer items-center gap-3 border px-3 py-2 font-mono text-sm transition-colors"
	class:border-primary={selected}
	class:bg-surface-2={selected}
	class:border-border={!selected}
	class:hover:border-border-highlight={!selected}
	onclick={() => onclick?.()}
>
	<!-- Time range -->
	<span class="shrink-0 text-fg-muted">
		{timeRange}
	</span>

	<!-- Duration -->
	<span
		class="shrink-0 font-bold"
		class:text-green={isRunning}
		class:text-fg-dark={!isRunning}
	>
		{duration}
	</span>

	<!-- Description -->
	{#if session.description}
		<span class="min-w-0 truncate text-fg">
			{session.description}
		</span>
	{/if}

	<!-- Tags -->
	{#if session.tags && session.tags.length > 0}
		<div class="flex shrink-0 items-center gap-1">
			{#each session.tags as tag (tag._id)}
				<TagBadge name={tag.name} color={tag.color} type={tag.type} />
			{/each}
		</div>
	{/if}

	<!-- Task count -->
	{#if session.taskIds && session.taskIds.length > 0}
		<span class="ml-auto shrink-0 text-xs text-fg-muted">
			{session.taskIds.length} task{session.taskIds.length !== 1 ? 's' : ''}
		</span>
	{/if}
</div>
