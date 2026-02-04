<script lang="ts">
	import TagBadge from '$lib/components/tags/TagBadge.svelte';

	interface Tag {
		_id: string;
		name: string;
		color?: string;
		type?: string;
	}

	interface Props {
		id: string;
		title: string;
		status: 'inbox' | 'active' | 'done';
		dueDate?: number;
		tags?: Tag[];
		createdAt: number;
		/** Whether this card is keyboard-selected. */
		selected?: boolean;
		/** Called when the task card is clicked (navigate to detail). */
		onclick?: (id: string) => void;
		/** Called when the status checkbox area is clicked. */
		onstatuschange?: (id: string) => void;
	}

	let {
		id,
		title,
		status,
		dueDate,
		tags = [],
		createdAt,
		selected = false,
		onclick,
		onstatuschange
	}: Props = $props();

	/** Format a timestamp to a short date. */
	function formatDate(ms: number): string {
		const d = new Date(ms);
		const month = String(d.getUTCMonth() + 1).padStart(2, '0');
		const day = String(d.getUTCDate()).padStart(2, '0');
		return `${month}/${day}`;
	}

	/** Check if a due date is in the past (overdue). */
	function isOverdue(ms: number): boolean {
		return ms < Date.now();
	}

	/** Cycle to the next status. */
	function handleStatusClick(e: Event) {
		e.stopPropagation();
		onstatuschange?.(id);
	}
</script>

<div
	class="group flex w-full cursor-pointer items-start gap-3 border px-3 py-2.5 text-left font-mono transition-colors {selected
		? 'border-primary bg-surface-1'
		: 'border-border bg-surface-0 hover:border-border-highlight hover:bg-surface-1'}"
	onclick={() => onclick?.(id)}
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') onclick?.(id);
	}}
	role="button"
	tabindex={selected ? 0 : -1}
>
	<!-- Status toggle area -->
	<button
		type="button"
		class="mt-0.5 shrink-0 opacity-70 transition-opacity hover:opacity-100"
		onclick={handleStatusClick}
		title="Cycle status"
	>
		{#if status === 'done'}
			<span class="text-green">[x]</span>
		{:else if status === 'active'}
			<span class="text-blue">[*]</span>
		{:else}
			<span class="text-fg-muted">[&nbsp;]</span>
		{/if}
	</button>

	<!-- Content -->
	<div class="flex min-w-0 flex-1 flex-col gap-1">
		<!-- Title row -->
		<div class="flex items-baseline gap-2">
			<span
				class="truncate text-sm"
				class:text-fg={status !== 'done'}
				class:text-fg-muted={status === 'done'}
				class:line-through={status === 'done'}
			>
				{title}
			</span>
		</div>

		<!-- Meta row: tags + due date -->
		{#if tags.length > 0 || dueDate}
			<div class="flex flex-wrap items-center gap-2">
				{#each tags as tag (tag._id)}
					<TagBadge
						name={tag.name}
						color={tag.color}
						type={tag.type}
						showPrefix={true}
					/>
				{/each}

				{#if dueDate}
					<span
						class="text-xs"
						class:text-warning={!isOverdue(dueDate)}
						class:text-red={isOverdue(dueDate)}
					>
						due:{formatDate(dueDate)}
					</span>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Created date (right side) -->
	<span
		class="shrink-0 text-xs text-fg-muted transition-opacity {selected
			? 'opacity-100'
			: 'opacity-0 group-hover:opacity-100'}"
	>
		{formatDate(createdAt)}
	</span>
</div>
