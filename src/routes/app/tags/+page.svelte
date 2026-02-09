<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import TagBadge from '$lib/components/tags/TagBadge.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { sortTags } from '$lib/utils/tags';
	import { isEditableTarget } from '$lib/utils/keys';
	import { commandPalette } from '$lib/stores/commandPalette.svelte';

	let { data } = $props();

	// ── Search (URL-driven via ?q= param, filtered client-side) ────
	let searchQuery = $derived(page.url.searchParams.get('q') || '');
	let isSearching = $derived(searchQuery.length > 0);

	const client = useConvexClient();
	const allTags = useQuery(api.tags.list, {}, () => ({
		initialData: data.preloaded?.tags
	}));

	const TAG_TYPES: { value: string | undefined; label: string }[] = [
		{ value: undefined, label: 'none' },
		{ value: 'priority', label: 'priority' },
		{ value: 'project', label: 'project' },
		{ value: 'category', label: 'category' },
		{ value: 'context', label: 'context' }
	];

	let sorted = $derived(allTags.data ? sortTags(allTags.data) : []);

	/** Filter tags by search query (case-insensitive match on name and type). */
	let filteredTags = $derived.by(() => {
		if (!searchQuery) return sorted;
		const q = searchQuery.toLowerCase();
		return sorted.filter(
			(t) =>
				t.name.toLowerCase().includes(q) ||
				(t.type && t.type.toLowerCase().includes(q))
		);
	});

	// Selection state — raw index that keyboard handlers update
	let rawSelectedIndex = $state(0);
	// Clamped to valid range so it never goes out of bounds
	let selectedIndex = $derived(
		filteredTags.length === 0
			? 0
			: Math.min(rawSelectedIndex, filteredTags.length - 1)
	);

	// Delete confirmation state
	let showDeleteConfirm = $state(false);
	let deleteTargetId = $state<string | null>(null);

	// Two-key sequence state (dd, gg)
	let pendingKey = $state('');
	let pendingTimer: ReturnType<typeof setTimeout> | undefined;

	// Row element references for scroll-into-view
	let rowEls: HTMLDivElement[] = $state([]);

	function scrollSelectedIntoView() {
		rowEls[selectedIndex]?.scrollIntoView({ block: 'nearest' });
	}

	async function handleTypeChange(tagId: string, type: string | undefined) {
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await client.mutation(api.tags.update, { id: tagId as any, type });
		} catch (error) {
			console.error('Failed to update tag:', error);
		}
	}

	function requestDelete(tagId: string) {
		deleteTargetId = tagId;
		showDeleteConfirm = true;
	}

	async function confirmDelete() {
		if (!deleteTargetId) return;
		showDeleteConfirm = false;
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await client.mutation(api.tags.remove, { id: deleteTargetId as any });
		} catch (error) {
			console.error('Failed to delete tag:', error);
		}
		deleteTargetId = null;
	}

	function cancelDelete() {
		showDeleteConfirm = false;
		deleteTargetId = null;
	}

	/** Get the current type index for a tag (0 = none, 1 = priority, etc.) */
	function typeIndex(type: string | undefined): number {
		const idx = TAG_TYPES.findIndex((t) => t.value === type);
		return idx === -1 ? 0 : idx;
	}

	/** Cycle the selected tag's type forward (l / ArrowRight) */
	function cycleTypeForward() {
		const tag = filteredTags[selectedIndex];
		if (!tag) return;
		const cur = typeIndex(tag.type);
		const next = (cur + 1) % TAG_TYPES.length;
		handleTypeChange(tag._id, TAG_TYPES[next].value);
	}

	/** Cycle the selected tag's type backward (h / ArrowLeft) */
	function cycleTypeBackward() {
		const tag = filteredTags[selectedIndex];
		if (!tag) return;
		const cur = typeIndex(tag.type);
		const next = (cur - 1 + TAG_TYPES.length) % TAG_TYPES.length;
		handleTypeChange(tag._id, TAG_TYPES[next].value);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (isEditableTarget(e)) return;
		if (commandPalette.isOpen) return;
		if (showDeleteConfirm) return;

		// Clear search with Escape
		if (e.key === 'Escape' && isSearching) {
			e.preventDefault();
			goto('/app/tags');
			return;
		}

		if (filteredTags.length === 0) return;

		// Second key of a two-key sequence
		if (pendingKey) {
			const combo = pendingKey + e.key;
			pendingKey = '';
			clearTimeout(pendingTimer);

			if (combo === 'dd') {
				e.preventDefault();
				const tag = filteredTags[selectedIndex];
				if (tag) requestDelete(tag._id);
				return;
			}
			if (combo === 'gg') {
				e.preventDefault();
				rawSelectedIndex = 0;
				scrollSelectedIntoView();
				return;
			}
			// Unknown combo — fall through
		}

		// Start a two-key sequence
		if (e.key === 'd' || e.key === 'g') {
			pendingKey = e.key;
			pendingTimer = setTimeout(() => {
				pendingKey = '';
			}, 500);
			return;
		}

		// j / ArrowDown — move selection down
		if (e.key === 'j' || e.key === 'ArrowDown') {
			e.preventDefault();
			if (selectedIndex < filteredTags.length - 1) {
				rawSelectedIndex++;
				scrollSelectedIntoView();
			}
			return;
		}

		// k / ArrowUp — move selection up
		if (e.key === 'k' || e.key === 'ArrowUp') {
			e.preventDefault();
			if (selectedIndex > 0) {
				rawSelectedIndex--;
				scrollSelectedIntoView();
			}
			return;
		}

		// l / ArrowRight — cycle type forward
		if (e.key === 'l' || e.key === 'ArrowRight') {
			e.preventDefault();
			cycleTypeForward();
			return;
		}

		// h / ArrowLeft — cycle type backward
		if (e.key === 'h' || e.key === 'ArrowLeft') {
			e.preventDefault();
			cycleTypeBackward();
			return;
		}

		// G — jump to last
		if (e.key === 'G') {
			e.preventDefault();
			rawSelectedIndex = filteredTags.length - 1;
			scrollSelectedIntoView();
			return;
		}
	}
</script>

<svelte:head>
	<title>tags | :wq</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="mx-auto flex max-w-3xl flex-col gap-6 p-6">
	<!-- Page header -->
	<div class="flex items-baseline gap-3">
		<h1 class="font-mono text-lg font-bold text-fg">
			<span class="text-fg-muted">+</span>
			tags
		</h1>
		{#if allTags.data}
			<span class="font-mono text-xs text-fg-muted">
				{allTags.data.length} tag{allTags.data.length !== 1 ? 's' : ''}
			</span>
		{/if}
	</div>

	<p class="font-mono text-xs text-fg-muted">
		Tags are created automatically when you use +tagname in a task. Here you can
		assign types and manage them.
	</p>

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
				onclick={() => goto('/app/tags')}
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

	{#if allTags.isLoading}
		<div class="py-8 text-center font-mono text-sm text-fg-muted">
			loading...
		</div>
	{:else if allTags.data && allTags.data.length === 0}
		<div class="py-8 text-center font-mono text-sm text-fg-muted">
			No tags yet. Create a task with +tagname to get started.
		</div>
	{:else if allTags.data}
		{#if isSearching && filteredTags.length === 0}
			<div class="py-8 text-center font-mono text-sm text-fg-muted">
				no tags matching "{searchQuery}"
			</div>
		{/if}
		<div class="flex flex-col gap-px">
			{#each filteredTags as tag, i (tag._id)}
				<div
					bind:this={rowEls[i]}
					class="flex items-center gap-4 border px-3 py-2.5 font-mono transition-colors"
					class:border-primary={i === selectedIndex}
					class:bg-surface-1={i === selectedIndex}
					class:border-border={i !== selectedIndex}
					class:bg-surface-0={i !== selectedIndex}
				>
					<!-- Tag badge -->
					<div class="w-40">
						<TagBadge name={tag.name} color={tag.color} type={tag.type} />
					</div>

					<!-- Type selector -->
					<div class="flex items-center gap-1.5">
						<span class="text-xs text-fg-muted">type:</span>
						{#each TAG_TYPES as opt (opt.label)}
							<button
								type="button"
								class="cursor-pointer border px-1.5 py-0.5 text-xs transition-colors"
								class:border-primary={tag.type === opt.value}
								class:text-primary={tag.type === opt.value}
								class:border-border={tag.type !== opt.value}
								class:text-fg-muted={tag.type !== opt.value}
								onclick={() => handleTypeChange(tag._id, opt.value)}
							>
								{opt.label}
							</button>
						{/each}
					</div>

					<!-- Delete button -->
					<button
						type="button"
						class="ml-auto cursor-pointer border border-border px-1.5 py-0.5 text-xs text-fg-muted transition-colors hover:border-red hover:text-red"
						onclick={() => requestDelete(tag._id)}
					>
						:d
					</button>
				</div>
			{/each}
		</div>
	{/if}
</div>

<ConfirmDialog
	open={showDeleteConfirm}
	message="delete this tag?"
	onconfirm={confirmDelete}
	oncancel={cancelDelete}
/>
