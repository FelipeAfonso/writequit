<script lang="ts">
	import { untrack, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { isEditableTarget } from '$lib/utils/keys';
	import type { PaginationStatus } from '$lib/stores/usePaginatedQuery.svelte';
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
		completedAt?: number;
		boardCommentCount?: number;
		boardCommentSeenCount?: number;
	}

	interface Props {
		tasks: Task[];
		/** Map of tagId -> tag document, for resolving tag display info. */
		tagsMap: Map<string, Tag>;
		/** Empty state message. */
		emptyMessage?: string;
		/** Returns the href for a given task ID. */
		taskHref?: (id: string) => string;
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
		/** Called on dd — delete the selected task. */
		ondelete?: (id: string) => void;
		/** Called on cc — edit the selected task. */
		onedit?: (id: string) => void;
		/** Pagination status from usePaginatedQuery. */
		paginationStatus?: PaginationStatus;
		/** Called to load the next page of results. */
		onloadmore?: () => void;
	}

	let {
		tasks,
		tagsMap,
		emptyMessage = 'No tasks found.',
		taskHref = (id) => `/app/tasks/${id}`,
		onstatuschange,
		onfilterprev,
		onfilternext,
		tagIds = [],
		ontagtoggle,
		onselect,
		ondelete,
		onedit,
		paginationStatus = 'Exhausted',
		onloadmore
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

	// ── Infinite scroll ──
	let sentinelEl: HTMLDivElement | undefined = $state();
	const LOAD_MORE_THRESHOLD = 3; // trigger loadMore when within N items of the end

	// IntersectionObserver: trigger loadMore when sentinel scrolls into view
	$effect(() => {
		if (!sentinelEl) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting && paginationStatus === 'CanLoadMore') {
					onloadmore?.();
				}
			},
			{ rootMargin: '200px' }
		);
		observer.observe(sentinelEl);
		return () => observer.disconnect();
	});

	/** Request more items when navigating near the bottom of the loaded list. */
	function maybeLoadMore(idx: number) {
		if (
			paginationStatus === 'CanLoadMore' &&
			onloadmore &&
			idx >= tasks.length - LOAD_MORE_THRESHOLD
		) {
			onloadmore();
		}
	}

	// ── Keyboard navigation ──
	let selectedIndex = $state(-1);
	let pendingG = $state(false);
	let pendingT = $state(false);
	let pendingDC = $state('');
	let gTimer: ReturnType<typeof setTimeout> | undefined;
	let tTimer: ReturnType<typeof setTimeout> | undefined;
	let dcTimer: ReturnType<typeof setTimeout> | undefined;
	let listEl: HTMLDivElement | undefined = $state();

	// Track the selected task's ID so we can follow it when the list reorders/changes.
	// This is intentionally NOT reactive ($state) to avoid circular effect dependencies.
	let trackedTaskId: string | undefined;

	// When the task list changes, try to follow the previously tracked task by ID.
	// If it's gone (e.g. moved to another filter), keep the same index position.
	// Uses untrack for selectedIndex so this only re-runs when `tasks` changes.
	$effect(() => {
		const len = tasks.length;
		const curIdx = untrack(() => selectedIndex);

		if (len === 0) {
			selectedIndex = -1;
			return;
		}

		if (curIdx < 0) return;

		// If the task is still in the list, follow it
		if (trackedTaskId) {
			const newIdx = tasks.findIndex((t) => t._id === trackedTaskId);
			if (newIdx >= 0) {
				selectedIndex = newIdx;
				tick().then(() => scrollToSelected(newIdx));
				return;
			}
		}

		// Task is gone — clamp index to stay at the same position (or the last item)
		const newIdx = Math.min(curIdx, len - 1);
		selectedIndex = newIdx;
		tick().then(() => scrollToSelected(newIdx));
	});

	// Notify parent of selection changes & update tracked task ID
	$effect(() => {
		const taskId =
			selectedIndex >= 0 && selectedIndex < tasks.length
				? tasks[selectedIndex]._id
				: undefined;
		trackedTaskId = taskId;
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
		maybeLoadMore(selectedIndex);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (isEditableTarget(e)) return;

		// dd / cc sequence: delete or edit selected task
		if (pendingDC) {
			const combo = pendingDC + e.key;
			pendingDC = '';
			clearTimeout(dcTimer);

			if (
				combo === 'dd' &&
				ondelete &&
				selectedIndex >= 0 &&
				tasks[selectedIndex]
			) {
				e.preventDefault();
				ondelete(tasks[selectedIndex]._id);
			}
			if (
				combo === 'cc' &&
				onedit &&
				selectedIndex >= 0 &&
				tasks[selectedIndex]
			) {
				e.preventDefault();
				onedit(tasks[selectedIndex]._id);
			}
			return;
		}

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
					goto(taskHref(tasks[selectedIndex]._id));
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

			case 'd':
			case 'c':
				pendingDC = e.key;
				dcTimer = setTimeout(() => {
					pendingDC = '';
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
				href={taskHref(task._id)}
				title={task.title}
				status={task.status}
				dueDate={task.dueDate}
				tags={resolveTags(task.tagIds)}
				createdAt={task.createdAt}
				selected={i === selectedIndex}
				boardCommentCount={task.boardCommentCount}
				boardCommentSeenCount={task.boardCommentSeenCount}
				{onstatuschange}
			/>
		{/each}
	</div>

	<!-- Infinite scroll sentinel & loading indicator -->
	{#if paginationStatus === 'CanLoadMore' || paginationStatus === 'LoadingMore'}
		<div
			bind:this={sentinelEl}
			class="flex items-center justify-center py-4 font-mono text-xs text-fg-muted"
		>
			{#if paginationStatus === 'LoadingMore'}
				loading...
			{/if}
		</div>
	{/if}

	<!-- Selection hint -->
	{#if selectedIndex >= 0}
		<div class="mt-2 font-mono text-xs text-fg-muted">
			{selectedIndex + 1}/{tasks.length}{paginationStatus !== 'Exhausted'
				? '+'
				: ''}
		</div>
	{/if}
{/if}
