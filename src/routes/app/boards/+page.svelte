<script lang="ts">
	import { goto } from '$app/navigation';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { isEditableTarget } from '$lib/utils/keys';
	import { commandPalette } from '$lib/stores/commandPalette.svelte';
	import { sortTags } from '$lib/utils/tags';
	import TagBadge from '$lib/components/tags/TagBadge.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';

	let { data } = $props();

	const client = useConvexClient();
	const boards = useQuery(api.boards.list, {}, () => ({
		initialData: data.preloaded?.boards
	}));
	const allTags = useQuery(api.tags.list, {}, () => ({
		initialData: data.preloaded?.tags
	}));

	// ── Create board form state ────────────────────────────────────
	let showCreateForm = $state(false);
	let newBoardName = $state('');
	let newStatusFilters = $state<string[]>([]);
	let newTagIds = $state<string[]>([]);

	// ── Selection & keyboard nav ───────────────────────────────────
	let rawSelectedIndex = $state(0);
	let selectedIndex = $derived(
		!boards.data || boards.data.length === 0
			? 0
			: Math.min(rawSelectedIndex, boards.data.length - 1)
	);

	// Delete confirmation
	let showDeleteConfirm = $state(false);
	let deleteTargetId = $state<string | null>(null);

	// Share dialog
	let showShareDialog = $state(false);
	let shareSlug = $state('');
	let sharePassword = $state('');
	let shareBoardName = $state('');

	// Two-key sequence state (dd, gg)
	let pendingKey = $state('');
	let pendingTimer: ReturnType<typeof setTimeout> | undefined;

	let rowEls: HTMLElement[] = $state([]);

	function scrollSelectedIntoView() {
		rowEls[selectedIndex]?.scrollIntoView({ block: 'nearest' });
	}

	let sorted = $derived(allTags.data ? sortTags(allTags.data) : []);

	async function handleCreate() {
		const name = newBoardName.trim();
		if (!name) return;

		try {
			const result = await client.mutation(api.boards.create, {
				name,
				filter: {
					statusFilters:
						newStatusFilters.length > 0
							? // eslint-disable-next-line @typescript-eslint/no-explicit-any
								(newStatusFilters as any)
							: undefined,
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					tagIds: newTagIds.length > 0 ? (newTagIds as any) : undefined
				}
			});

			// Show share dialog with the generated credentials
			shareSlug = result.slug;
			sharePassword = result.password;
			shareBoardName = name;
			showShareDialog = true;

			// Reset form
			newBoardName = '';
			newStatusFilters = [];
			newTagIds = [];
			showCreateForm = false;
		} catch (error) {
			console.error('Failed to create board:', error);
		}
	}

	function toggleNewTag(tagId: string) {
		const idx = newTagIds.indexOf(tagId);
		if (idx === -1) {
			newTagIds = [...newTagIds, tagId];
		} else {
			newTagIds = newTagIds.filter((id) => id !== tagId);
		}
	}

	function requestDelete(boardId: string) {
		deleteTargetId = boardId;
		showDeleteConfirm = true;
	}

	async function confirmDelete() {
		if (!deleteTargetId) return;
		showDeleteConfirm = false;
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await client.mutation(api.boards.remove, { id: deleteTargetId as any });
		} catch (error) {
			console.error('Failed to delete board:', error);
		}
		deleteTargetId = null;
	}

	function cancelDelete() {
		showDeleteConfirm = false;
		deleteTargetId = null;
	}

	let copiedField = $state<string | null>(null);
	let copiedTimer: ReturnType<typeof setTimeout> | undefined;

	async function copyToClipboard(text: string, field: string) {
		try {
			await navigator.clipboard.writeText(text);
			clearTimeout(copiedTimer);
			copiedField = field;
			copiedTimer = setTimeout(() => {
				copiedField = null;
			}, 2000);
		} catch {
			// Fallback: do nothing
		}
	}

	function getBoardUrl(slug: string): string {
		if (typeof window !== 'undefined') {
			return `${window.location.origin}/board/${slug}`;
		}
		return `/board/${slug}`;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (isEditableTarget(e)) return;
		if (commandPalette.isOpen) return;
		if (showDeleteConfirm || showCreateForm || showShareDialog) return;

		if (!boards.data || boards.data.length === 0) return;

		// Second key of a two-key sequence
		if (pendingKey) {
			const combo = pendingKey + e.key;
			pendingKey = '';
			clearTimeout(pendingTimer);

			if (combo === 'dd') {
				e.preventDefault();
				const board = boards.data[selectedIndex];
				if (board) requestDelete(board._id);
				return;
			}
			if (combo === 'gg') {
				e.preventDefault();
				rawSelectedIndex = 0;
				scrollSelectedIntoView();
				return;
			}
		}

		// Start a two-key sequence
		if (e.key === 'd' || e.key === 'g') {
			pendingKey = e.key;
			pendingTimer = setTimeout(() => {
				pendingKey = '';
			}, 500);
			return;
		}

		if (e.key === 'j' || e.key === 'ArrowDown') {
			e.preventDefault();
			if (selectedIndex < boards.data.length - 1) {
				rawSelectedIndex++;
				scrollSelectedIntoView();
			}
			return;
		}

		if (e.key === 'k' || e.key === 'ArrowUp') {
			e.preventDefault();
			if (selectedIndex > 0) {
				rawSelectedIndex--;
				scrollSelectedIntoView();
			}
			return;
		}

		if (e.key === 'G') {
			e.preventDefault();
			rawSelectedIndex = boards.data.length - 1;
			scrollSelectedIntoView();
			return;
		}

		if (e.key === 'Enter') {
			e.preventDefault();
			const board = boards.data[selectedIndex];
			if (board) goto(`/app/boards/${board._id}`);
			return;
		}
	}
</script>

<svelte:head>
	<title>boards | :wq</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="mx-auto flex max-w-3xl flex-col gap-6 p-6">
	<!-- Page header -->
	<div class="flex items-baseline justify-between">
		<div class="flex items-baseline gap-3">
			<h1 class="font-mono text-lg font-bold text-fg">
				<span class="text-fg-muted">&</span>
				boards
			</h1>
			{#if boards.data}
				<span class="font-mono text-xs text-fg-muted">
					{boards.data.length} board{boards.data.length !== 1 ? 's' : ''}
				</span>
			{/if}
		</div>

		<button
			type="button"
			class="cursor-pointer border border-green px-3 py-1 font-mono text-xs text-green transition-colors hover:bg-green hover:text-bg-dark"
			onclick={() => (showCreateForm = !showCreateForm)}
		>
			{showCreateForm ? '[x] cancel' : '[+] new board'}
		</button>
	</div>

	<p class="font-mono text-xs text-fg-muted">
		Boards let you share a filtered view of tasks with external contributors.
		They can change task priorities and leave comments.
	</p>

	<!-- Create form -->
	{#if showCreateForm}
		<div
			class="flex flex-col gap-4 border border-border-highlight bg-surface-1 p-4"
		>
			<h2 class="font-mono text-sm font-bold text-fg">new board</h2>

			<!-- Name -->
			<div class="flex flex-col gap-1">
				<label for="board-name" class="font-mono text-xs text-fg-muted">
					name
				</label>
				<input
					id="board-name"
					type="text"
					bind:value={newBoardName}
					placeholder="Sprint 12 Tasks"
					class="border border-border bg-bg px-3 py-1.5 font-mono text-sm text-fg outline-none focus:border-primary"
				/>
			</div>

			<!-- Status filter (multi-select) -->
			<div class="flex flex-col gap-1">
				<span class="font-mono text-xs text-fg-muted">
					status filter
					{#if newStatusFilters.length === 0}
						<span class="text-fg-muted opacity-60">(all)</span>
					{/if}
				</span>
				<div class="flex gap-1">
					{#each ['inbox', 'active', 'done'] as status (status)}
						<button
							type="button"
							class="cursor-pointer border px-2 py-0.5 font-mono text-xs transition-colors"
							class:border-primary={newStatusFilters.includes(status)}
							class:text-primary={newStatusFilters.includes(status)}
							class:border-border={!newStatusFilters.includes(status)}
							class:text-fg-muted={!newStatusFilters.includes(status)}
							onclick={() => {
								const idx = newStatusFilters.indexOf(status);
								if (idx === -1) {
									newStatusFilters = [...newStatusFilters, status];
								} else {
									newStatusFilters = newStatusFilters.filter(
										(s) => s !== status
									);
								}
							}}
						>
							{status}
						</button>
					{/each}
				</div>
			</div>

			<!-- Tag filter -->
			{#if sorted.length > 0}
				<div class="flex flex-col gap-1">
					<span class="font-mono text-xs text-fg-muted">
						tag filter (tasks must have ALL selected tags)
					</span>
					<div class="flex flex-wrap gap-1">
						{#each sorted as tag (tag._id)}
							<TagBadge
								name={tag.name}
								color={tag.color}
								type={tag.type}
								active={newTagIds.includes(tag._id)}
								onclick={() => toggleNewTag(tag._id)}
							/>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Submit -->
			<button
				type="button"
				class="cursor-pointer self-start border border-green px-4 py-1.5 font-mono text-xs text-green transition-colors hover:bg-green hover:text-bg-dark disabled:cursor-not-allowed disabled:opacity-50"
				disabled={!newBoardName.trim()}
				onclick={handleCreate}
			>
				:w create
			</button>
		</div>
	{/if}

	<!-- Boards list -->
	{#if boards.isLoading}
		<div class="py-8 text-center font-mono text-sm text-fg-muted">
			loading...
		</div>
	{:else if boards.data && boards.data.length === 0}
		<div class="py-8 text-center font-mono text-sm text-fg-muted">
			No boards yet. Create one to share tasks with external contributors.
		</div>
	{:else if boards.data}
		<div class="flex flex-col gap-px">
			{#each boards.data as board, i (board._id)}
				<div
					bind:this={rowEls[i]}
					class="flex items-center gap-4 border px-3 py-2.5 font-mono transition-colors"
					class:border-primary={i === selectedIndex}
					class:bg-surface-1={i === selectedIndex}
					class:border-border={i !== selectedIndex}
					class:bg-surface-0={i !== selectedIndex}
				>
					<!-- Board link (content area) -->
					<a
						href="/app/boards/{board._id}"
						class="flex min-w-0 flex-1 flex-col gap-1 no-underline"
						tabindex={i === selectedIndex ? 0 : -1}
					>
						<div class="flex items-baseline gap-2">
							<span class="text-sm text-fg">{board.name}</span>
							{#if !board.isActive}
								<span class="text-xs text-red">[inactive]</span>
							{/if}
						</div>

						<!-- Filter info -->
						<div class="flex flex-wrap items-center gap-2">
							{#if board.filter.statusFilters && board.filter.statusFilters.length > 0}
								<span class="text-xs text-fg-muted">
									status:{board.filter.statusFilters.join(',')}
								</span>
							{/if}
							{#if board.filterTags && board.filterTags.length > 0}
								{#each board.filterTags as tag (tag._id)}
									<TagBadge
										name={tag.name}
										color={tag.color}
										type={tag.type}
										showPrefix={true}
									/>
								{/each}
							{/if}
						</div>
					</a>

					<!-- Delete button (sibling, not nested in anchor) -->
					<button
						type="button"
						class="shrink-0 cursor-pointer border border-border px-1.5 py-0.5 text-xs text-fg-muted transition-colors hover:border-red hover:text-red"
						onclick={() => requestDelete(board._id)}
					>
						:d
					</button>
				</div>
			{/each}
		</div>
	{/if}
</div>

<!-- Share dialog -->
{#if showShareDialog}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
		onmousedown={() => (showShareDialog = false)}
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="flex max-w-lg flex-col gap-4 border border-border-highlight bg-bg-dark p-6 font-mono"
			onmousedown={(e) => e.stopPropagation()}
		>
			<h2 class="text-sm font-bold text-fg">board created: {shareBoardName}</h2>
			<p class="text-xs text-fg-muted">
				Share these credentials with your contributor. The password is shown
				only once.
			</p>

			<div class="flex flex-col gap-2">
				<div class="flex flex-col gap-1">
					<span class="text-xs text-fg-muted">url</span>
					<div class="flex items-center gap-2">
						<code
							class="flex-1 border border-border bg-surface-2 px-2 py-1 text-xs text-green"
						>
							{getBoardUrl(shareSlug)}
						</code>
						<button
							type="button"
							class="cursor-pointer border px-2 py-1 text-xs transition-colors {copiedField ===
							'url'
								? 'border-green text-green'
								: 'border-border text-fg-muted hover:border-primary hover:text-primary'}"
							onclick={() => copyToClipboard(getBoardUrl(shareSlug), 'url')}
						>
							{copiedField === 'url' ? 'copied!' : 'copy'}
						</button>
					</div>
				</div>

				<div class="flex flex-col gap-1">
					<span class="text-xs text-fg-muted">password</span>
					<div class="flex items-center gap-2">
						<code
							class="flex-1 border border-border bg-surface-2 px-2 py-1 text-xs text-warning"
						>
							{sharePassword}
						</code>
						<button
							type="button"
							class="cursor-pointer border px-2 py-1 text-xs transition-colors {copiedField ===
							'password'
								? 'border-green text-green'
								: 'border-border text-fg-muted hover:border-primary hover:text-primary'}"
							onclick={() => copyToClipboard(sharePassword, 'password')}
						>
							{copiedField === 'password' ? 'copied!' : 'copy'}
						</button>
					</div>
				</div>
			</div>

			<button
				type="button"
				class="cursor-pointer self-end border border-border px-3 py-1 text-xs text-fg-muted transition-colors hover:border-primary hover:text-primary"
				onclick={() => (showShareDialog = false)}
			>
				close
			</button>
		</div>
	</div>
{/if}

<ConfirmDialog
	open={showDeleteConfirm}
	message="delete this board and all its comments?"
	onconfirm={confirmDelete}
	oncancel={cancelDelete}
/>
