<script lang="ts">
	import { isEditableTarget } from '$lib/utils/keys';
	import TaskCard from './TaskCard.svelte';

	interface Tag {
		_id: string;
		name: string;
		color?: string;
		type?: string;
	}

	interface Task {
		_id: string;
		title: string;
		status: 'inbox' | 'active' | 'done';
		dueDate?: number;
		tagIds: string[];
		createdAt: number;
	}

	interface Props {
		tasks: Task[];
		/** Map of tagId -> tag document, for resolving tag display info. */
		tagsMap: Map<string, Tag>;
		/** Empty state message. */
		emptyMessage?: string;
		/** Called when a task is clicked. */
		ontaskclick?: (id: string) => void;
		/** Called when a task's status toggle is clicked. */
		onstatuschange?: (id: string) => void;
		/** Called on h/ArrowLeft — cycle filter left. */
		onfilterprev?: () => void;
		/** Called on l/ArrowRight — cycle filter right. */
		onfilternext?: () => void;
		/** Ordered list of tag IDs for t+number toggling. */
		tagIds?: string[];
		/** Called on t+number — toggle tag by index. 0 = clear all. */
		ontagtoggle?: (index: number) => void;
		/** Called whenever the selected task changes. */
		onselect?: (taskId: string | undefined) => void;
	}

	let {
		tasks,
		tagsMap,
		emptyMessage = 'No tasks found.',
		ontaskclick,
		onstatuschange,
		onfilterprev,
		onfilternext,
		tagIds = [],
		ontagtoggle,
		onselect
	}: Props = $props();

	/** Resolve tag IDs to tag objects using the provided map. */
	function resolveTags(tagIds: string[]): Tag[] {
		const resolved: Tag[] = [];
		for (const id of tagIds) {
			const tag = tagsMap.get(id);
			if (tag) resolved.push(tag);
		}
		return resolved;
	}

	// ── Keyboard navigation ──
	let selectedIndex = $state(-1);
	let pendingG = $state(false);
	let pendingT = $state(false);
	let gTimer: ReturnType<typeof setTimeout> | undefined;
	let tTimer: ReturnType<typeof setTimeout> | undefined;
	let listEl: HTMLDivElement | undefined = $state();

	// Reset selection when tasks change
	$effect(() => {
		// Access tasks.length to create a dependency
		if (tasks.length === 0) {
			selectedIndex = -1;
		} else if (selectedIndex >= tasks.length) {
			selectedIndex = tasks.length - 1;
		}
	});

	// Notify parent of selection changes
	$effect(() => {
		const taskId =
			selectedIndex >= 0 && selectedIndex < tasks.length
				? tasks[selectedIndex]._id
				: undefined;
		onselect?.(taskId);
	});

	function clamp(idx: number): number {
		if (tasks.length === 0) return -1;
		return Math.max(0, Math.min(idx, tasks.length - 1));
	}

	/** Scroll the selected card into view. */
	function scrollToSelected(idx: number) {
		if (!listEl || idx < 0) return;
		const cards = listEl.children;
		if (cards[idx]) {
			(cards[idx] as HTMLElement).scrollIntoView({
				block: 'nearest',
				behavior: 'smooth'
			});
		}
	}

	function moveTo(idx: number) {
		selectedIndex = clamp(idx);
		scrollToSelected(selectedIndex);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (isEditableTarget(e)) return;

		// t+number sequence: toggle tag filter
		if (pendingT) {
			pendingT = false;
			clearTimeout(tTimer);
			const num = parseInt(e.key, 10);
			if (!isNaN(num) && ontagtoggle) {
				e.preventDefault();
				ontagtoggle(num);
			}
			return;
		}

		// Filter cycling works even when the list is empty
		switch (e.key) {
			case 'h':
			case 'ArrowLeft':
				if (onfilterprev) {
					e.preventDefault();
					onfilterprev();
				}
				return;

			case 'l':
			case 'ArrowRight':
				if (onfilternext) {
					e.preventDefault();
					onfilternext();
				}
				return;

			case 't':
				if (ontagtoggle && tagIds.length > 0) {
					pendingT = true;
					tTimer = setTimeout(() => {
						pendingT = false;
					}, 500);
				}
				return;
		}

		// Everything below requires tasks
		if (tasks.length === 0) return;

		// gg sequence: jump to first
		if (pendingG) {
			pendingG = false;
			clearTimeout(gTimer);
			if (e.key === 'g') {
				e.preventDefault();
				moveTo(0);
			}
			return;
		}

		switch (e.key) {
			case 'j':
			case 'ArrowDown':
				e.preventDefault();
				moveTo(selectedIndex < 0 ? 0 : selectedIndex + 1);
				break;

			case 'k':
			case 'ArrowUp':
				e.preventDefault();
				moveTo(selectedIndex < 0 ? 0 : selectedIndex - 1);
				break;

			case 'Enter':
				if (selectedIndex >= 0 && tasks[selectedIndex]) {
					e.preventDefault();
					ontaskclick?.(tasks[selectedIndex]._id);
				}
				break;

			case 'x':
				if (selectedIndex >= 0 && tasks[selectedIndex]) {
					e.preventDefault();
					onstatuschange?.(tasks[selectedIndex]._id);
				}
				break;

			case 'G':
				e.preventDefault();
				moveTo(tasks.length - 1);
				break;

			case 'g':
				pendingG = true;
				gTimer = setTimeout(() => {
					pendingG = false;
				}, 500);
				break;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if pendingT}
	<div
		class="fixed right-4 bottom-4 z-50 border border-border-highlight bg-surface-1 px-3 py-1.5 font-mono text-xs text-primary"
	>
		t-
	</div>
{/if}

{#if tasks.length === 0}
	<div
		class="flex items-center justify-center py-12 font-mono text-sm text-fg-muted"
	>
		{emptyMessage}
	</div>
{:else}
	<div class="flex flex-col gap-px" bind:this={listEl}>
		{#each tasks as task, i (task._id)}
			<TaskCard
				id={task._id}
				title={task.title}
				status={task.status}
				dueDate={task.dueDate}
				tags={resolveTags(task.tagIds)}
				createdAt={task.createdAt}
				selected={i === selectedIndex}
				onclick={ontaskclick}
				{onstatuschange}
			/>
		{/each}
	</div>

	<!-- Selection hint -->
	{#if selectedIndex >= 0}
		<div class="mt-2 font-mono text-xs text-fg-muted">
			{selectedIndex + 1}/{tasks.length}
		</div>
	{/if}
{/if}
