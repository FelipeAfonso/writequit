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
		href: string;
		selected?: boolean;
	}

	let { session, href, selected = false }: Props = $props();

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

<a
	{href}
	class="flex items-center gap-3 border px-3 py-2 font-mono text-sm no-underline transition-colors"
	class:border-primary={selected}
	class:bg-surface-2={selected}
	class:border-border={!selected}
	class:hover:border-border-highlight={!selected}
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
</a>
