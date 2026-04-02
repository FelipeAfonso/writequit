<script lang="ts">
	import { goto } from '$app/navigation';
	import { tick } from 'svelte';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { isEditableTarget } from '$lib/utils/keys';
	import { commandPalette } from '$lib/stores/commandPalette.svelte';
	import { sortTags } from '$lib/utils/tags';
	import TagBadge from '$lib/components/tags/TagBadge.svelte';
	import TaskStatusBadge from '$lib/components/tasks/TaskStatusBadge.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';

	let { data } = $props();

	const client = useConvexClient();

	// svelte-ignore state_referenced_locally
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const boardId = data.boardId as any;

	const board = useQuery(
		api.boards.get,
		() => ({ id: boardId }),
		() => ({ initialData: data.preloaded?.board })
	);

	const tasks = useQuery(
		api.boards.getTasks,
		() => ({ id: boardId }),
		() => ({ initialData: data.preloaded?.tasks })
	);
	const comments = useQuery(
		api.boards.getComments,
		() => ({ boardId }),
		() => ({ initialData: data.preloaded?.comments })
	);
	const chatMessages = useQuery(
		api.boards.getMessages,
		() => ({ boardId }),
		() => ({ initialData: data.preloaded?.messages })
	);

	const allTags = useQuery(api.tags.list, {}, () => ({
		initialData: data.preloaded?.tags
	}));

	let sorted = $derived(allTags.data ? sortTags(allTags.data) : []);

	// ── Edit form state ────────────────────────────────────────────
	let isEditing = $state(false);
	let editName = $state('');
	let editStatusFilters = $state<string[]>([]);
	let editTagIds = $state<string[]>([]);

	// ── Share dialog ───────────────────────────────────────────────
	let showShareDialog = $state(false);
	let sharePassword = $state('');

	// ── Delete confirmation ────────────────────────────────────────
	let showDeleteConfirm = $state(false);

	// ── Chat state ─────────────────────────────────────────────────
	let chatOpen = $state(true);
	let newChatMessage = $state('');
	let isSendingChat = $state(false);
	let chatScrollEl: HTMLDivElement | undefined = $state();

	// Auto-scroll chat when new messages arrive
	$effect(() => {
		if (chatMessages.data && chatScrollEl) {
			tick().then(() => {
				if (chatScrollEl) {
					chatScrollEl.scrollTop = chatScrollEl.scrollHeight;
				}
			});
		}
	});

	function startEdit() {
		if (!board.data) return;
		editName = board.data.name;
		editStatusFilters = board.data.filter.statusFilters
			? [...board.data.filter.statusFilters]
			: [];
		editTagIds = board.data.filter.tagIds ? [...board.data.filter.tagIds] : [];
		isEditing = true;
	}

	async function saveEdit() {
		if (!board.data) return;
		const name = editName.trim();
		if (!name) return;

		try {
			await client.mutation(api.boards.update, {
				id: boardId,
				name,
				filter: {
					statusFilters:
						editStatusFilters.length > 0
							? // eslint-disable-next-line @typescript-eslint/no-explicit-any
								(editStatusFilters as any)
							: undefined,
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					tagIds: editTagIds.length > 0 ? (editTagIds as any) : undefined
				}
			});
			isEditing = false;
		} catch (error) {
			console.error('Failed to update board:', error);
		}
	}

	function toggleEditTag(tagId: string) {
		const idx = editTagIds.indexOf(tagId);
		if (idx === -1) {
			editTagIds = [...editTagIds, tagId];
		} else {
			editTagIds = editTagIds.filter((id) => id !== tagId);
		}
	}

	async function handleRegenerate() {
		try {
			const result = await client.mutation(api.boards.regeneratePassword, {
				id: boardId
			});
			sharePassword = result.password;
			showShareDialog = true;
		} catch (error) {
			console.error('Failed to regenerate password:', error);
		}
	}

	async function handleToggleActive() {
		try {
			await client.mutation(api.boards.toggleActive, { id: boardId });
		} catch (error) {
			console.error('Failed to toggle board:', error);
		}
	}

	async function confirmDelete() {
		showDeleteConfirm = false;
		try {
			await client.mutation(api.boards.remove, { id: boardId });
			goto('/app/boards');
		} catch (error) {
			console.error('Failed to delete board:', error);
		}
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

	/** Group comments by taskId. */
	let commentsByTask = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- derived re-creates the map
		const map = new Map<string, NonNullable<typeof comments.data>>();
		if (!comments.data) return map;
		for (const c of comments.data) {
			const existing = map.get(c.taskId) ?? [];
			existing.push(c);
			map.set(c.taskId, existing);
		}
		return map;
	});

	async function sendChatMessage() {
		if (!newChatMessage.trim() || isSendingChat) return;
		isSendingChat = true;
		try {
			await client.mutation(api.boards.sendMessage, {
				boardId,
				content: newChatMessage.trim()
			});
			newChatMessage = '';
		} catch (error) {
			console.error('Failed to send message:', error);
		} finally {
			isSendingChat = false;
		}
	}

	function formatChatTime(ms: number): string {
		return new Date(ms).toLocaleTimeString('en-US', {
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	// Register page-specific command actions
	$effect(() => {
		commandPalette.registerActions({
			navigateBack: () => goto('/app/boards')
		});

		return () => {
			commandPalette.unregisterActions(['navigateBack']);
		};
	});

	function handleKeydown(e: KeyboardEvent) {
		if (isEditableTarget(e)) return;
		if (commandPalette.isOpen) return;
		if (showDeleteConfirm || isEditing || showShareDialog) return;

		if (e.key === 'Backspace') {
			e.preventDefault();
			goto('/app/boards');
			return;
		}

		if (e.key === 'c' && !e.ctrlKey && !e.metaKey) {
			e.preventDefault();
			startEdit();
			return;
		}
	}
</script>

<svelte:head>
	<title>{board.data?.name ?? 'board'} | :wq</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="flex h-full">
	<!-- Main content -->
	<div class="flex-1 overflow-y-auto p-6">
		<div class="mx-auto flex max-w-3xl flex-col gap-6">
			<!-- Back link -->
			<a
				href="/app/boards"
				class="inline-flex items-center gap-1 font-mono text-xs text-fg-muted transition-colors hover:text-fg-dark"
			>
				&lt;- boards
			</a>

			{#if board.isLoading}
				<div class="py-8 text-center font-mono text-sm text-fg-muted">
					loading...
				</div>
			{:else if !board.data}
				<div class="py-8 text-center font-mono text-sm text-fg-muted">
					board not found
				</div>
			{:else}
				<!-- Board header -->
				<div class="flex items-baseline justify-between">
					<h1 class="font-mono text-lg font-bold text-fg">
						<span class="text-fg-muted">&</span>
						{board.data.name}
					</h1>
					<div class="flex items-center gap-2">
						{#if !board.data.isActive}
							<span
								class="border border-red px-1.5 py-0.5 font-mono text-xs text-red"
							>
								inactive
							</span>
						{:else}
							<span
								class="border border-green px-1.5 py-0.5 font-mono text-xs text-green"
							>
								active
							</span>
						{/if}
					</div>
				</div>

				<!-- Board info -->
				<div
					class="flex flex-col gap-3 border border-border bg-surface-0 p-4 font-mono"
				>
					<div class="flex items-center justify-between">
						<span class="text-xs text-fg-muted">
							{board.data.commentCount} comment{board.data.commentCount !== 1
								? 's'
								: ''}
						</span>
					</div>

					<!-- Filters -->
					<div class="flex flex-wrap items-center gap-2">
						<span class="text-xs text-fg-muted">filters:</span>
						{#if board.data.filter.statusFilters && board.data.filter.statusFilters.length > 0}
							<span
								class="border border-border px-1.5 py-0.5 text-xs text-fg-dark"
							>
								status:{board.data.filter.statusFilters.join(',')}
							</span>
						{:else}
							<span class="text-xs text-fg-muted">no status filter</span>
						{/if}
						{#if board.data.filterTags && board.data.filterTags.length > 0}
							{#each board.data.filterTags as tag (tag._id)}
								<TagBadge
									name={tag.name}
									color={tag.color}
									type={tag.type}
									showPrefix={true}
								/>
							{/each}
						{/if}
					</div>

					<!-- Share URL -->
					<div class="flex flex-col gap-1">
						<span class="text-xs text-fg-muted">share url</span>
						<div class="flex items-center gap-2">
							<code
								class="flex-1 border border-border bg-surface-2 px-2 py-1 text-xs text-green"
							>
								{getBoardUrl(board.data.slug)}
							</code>
							<button
								type="button"
								class="cursor-pointer border px-2 py-1 text-xs transition-colors {copiedField ===
								'url'
									? 'border-green text-green'
									: 'border-border text-fg-muted hover:border-primary hover:text-primary'}"
								onclick={() =>
									copyToClipboard(getBoardUrl(board.data?.slug ?? ''), 'url')}
							>
								{copiedField === 'url' ? 'copied!' : 'copy'}
							</button>
						</div>
					</div>

					<!-- Actions -->
					<div class="flex flex-wrap gap-2">
						<button
							type="button"
							class="cursor-pointer border border-border px-2 py-1 text-xs text-fg-muted transition-colors hover:border-primary hover:text-primary"
							onclick={startEdit}
						>
							edit
						</button>
						<button
							type="button"
							class="cursor-pointer border border-border px-2 py-1 text-xs text-fg-muted transition-colors hover:border-warning hover:text-warning"
							onclick={handleRegenerate}
						>
							new password
						</button>
						<button
							type="button"
							class="cursor-pointer border border-border px-2 py-1 text-xs text-fg-muted transition-colors hover:border-primary hover:text-primary"
							onclick={handleToggleActive}
						>
							{board.data.isActive ? 'deactivate' : 'activate'}
						</button>
						<button
							type="button"
							class="cursor-pointer border border-border px-2 py-1 text-xs text-fg-muted transition-colors hover:border-red hover:text-red"
							onclick={() => (showDeleteConfirm = true)}
						>
							delete
						</button>
					</div>
				</div>

				<!-- Edit form overlay -->
				{#if isEditing}
					<div
						class="flex flex-col gap-4 border border-border-highlight bg-surface-1 p-4"
					>
						<h2 class="font-mono text-sm font-bold text-fg">edit board</h2>

						<div class="flex flex-col gap-1">
							<label for="edit-name" class="font-mono text-xs text-fg-muted">
								name
							</label>
							<input
								id="edit-name"
								type="text"
								bind:value={editName}
								class="border border-border bg-bg px-3 py-1.5 font-mono text-sm text-fg outline-none focus:border-primary"
							/>
						</div>

						<div class="flex flex-col gap-1">
							<span class="font-mono text-xs text-fg-muted">
								status filter
								{#if editStatusFilters.length === 0}
									<span class="text-fg-muted opacity-60">(all)</span>
								{/if}
							</span>
							<div class="flex gap-1">
								{#each ['inbox', 'active', 'done'] as status (status)}
									<button
										type="button"
										class="cursor-pointer border px-2 py-0.5 font-mono text-xs transition-colors"
										class:border-primary={editStatusFilters.includes(status)}
										class:text-primary={editStatusFilters.includes(status)}
										class:border-border={!editStatusFilters.includes(status)}
										class:text-fg-muted={!editStatusFilters.includes(status)}
										onclick={() => {
											const idx = editStatusFilters.indexOf(status);
											if (idx === -1) {
												editStatusFilters = [...editStatusFilters, status];
											} else {
												editStatusFilters = editStatusFilters.filter(
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

						{#if sorted.length > 0}
							<div class="flex flex-col gap-1">
								<span class="font-mono text-xs text-fg-muted">tag filter</span>
								<div class="flex flex-wrap gap-1">
									{#each sorted as tag (tag._id)}
										<TagBadge
											name={tag.name}
											color={tag.color}
											type={tag.type}
											active={editTagIds.includes(tag._id)}
											onclick={() => toggleEditTag(tag._id)}
										/>
									{/each}
								</div>
							</div>
						{/if}

						<div class="flex gap-2">
							<button
								type="button"
								class="cursor-pointer border border-green px-3 py-1 font-mono text-xs text-green transition-colors hover:bg-green hover:text-bg-dark"
								onclick={saveEdit}
							>
								:w save
							</button>
							<button
								type="button"
								class="cursor-pointer border border-border px-3 py-1 font-mono text-xs text-fg-muted transition-colors hover:border-border-highlight hover:text-fg-dark"
								onclick={() => (isEditing = false)}
							>
								cancel
							</button>
						</div>
					</div>
				{/if}

				<!-- Tasks preview -->
				<div class="flex flex-col gap-2">
					<h2 class="font-mono text-sm font-bold text-fg-muted">
						tasks ({tasks.data?.length ?? 0})
					</h2>

					{#if tasks.isLoading}
						<div class="py-4 text-center font-mono text-xs text-fg-muted">
							loading...
						</div>
					{:else if tasks.data && tasks.data.length === 0}
						<div class="py-4 text-center font-mono text-xs text-fg-muted">
							no tasks match this board's filters
						</div>
					{:else if tasks.data}
						<div class="flex flex-col gap-px">
							{#each tasks.data as task (task._id)}
								{@const taskComments = commentsByTask.get(task._id)}
								<div
									class="flex items-start gap-3 border border-border bg-surface-0 px-3 py-2 font-mono"
								>
									<TaskStatusBadge status={task.status} />
									<div class="flex min-w-0 flex-1 flex-col gap-1">
										<div class="flex items-baseline gap-2">
											<span class="truncate text-sm text-fg">
												{task.title}
											</span>
											{#if task.commentCount > 0}
												<span class="text-xs text-cyan">
													[{task.commentCount}]
												</span>
											{/if}
										</div>
										{#if task.tags && task.tags.length > 0}
											<div class="flex flex-wrap gap-1">
												{#each task.tags as tag (tag._id)}
													<TagBadge
														name={tag.name}
														color={tag.color}
														type={tag.type}
														showPrefix={true}
													/>
												{/each}
											</div>
										{/if}
										{#if taskComments && taskComments.length > 0}
											<div
												class="mt-1 flex flex-col gap-1 border-l-2 border-border pl-2"
											>
												{#each taskComments as comment (comment._id)}
													<div class="text-xs">
														<span class="text-primary">
															{comment.authorName}:
														</span>
														<span class="text-fg-dark">
															{comment.content}
														</span>
													</div>
												{/each}
											</div>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>

	<!-- Chat sidebar + toggle -->
	<div class="relative flex shrink-0">
		<!-- Toggle tab on the left edge of the sidebar -->
		<button
			type="button"
			onclick={() => (chatOpen = !chatOpen)}
			class="absolute bottom-4 z-10 cursor-pointer border border-border bg-surface-0 px-1.5 py-1 font-mono text-xs transition-colors {chatOpen
				? '-left-7 text-primary hover:bg-surface-1'
				: '-left-12 text-fg-muted hover:bg-surface-1 hover:text-primary'}"
			title={chatOpen ? 'Hide chat' : 'Show chat'}
		>
			{chatOpen ? '<' : 'chat'}
		</button>

		{#if chatOpen}
			<div class="flex w-80 flex-col border-l border-border bg-surface-0">
				<div class="border-b border-border px-3 py-2">
					<h3 class="font-mono text-xs font-bold text-fg-muted">chat</h3>
				</div>

				<!-- Messages -->
				<div
					bind:this={chatScrollEl}
					class="flex flex-1 flex-col gap-2 overflow-y-auto p-3"
				>
					{#if chatMessages.isLoading}
						<p class="py-4 text-center font-mono text-xs text-fg-muted">
							loading...
						</p>
					{:else if !chatMessages.data || chatMessages.data.length === 0}
						<p class="py-4 text-center font-mono text-xs text-fg-muted">
							no messages yet
						</p>
					{:else}
						{#each chatMessages.data as msg (msg._id)}
							<div class="flex flex-col gap-0.5">
								<div class="flex items-baseline gap-2">
									<span
										class="font-mono text-xs font-bold {msg.authorType ===
										'owner'
											? 'text-green'
											: 'text-primary'}"
									>
										{msg.authorName}
										{#if msg.authorType === 'owner'}
											<span class="font-normal text-green/60">(you)</span>
										{/if}
									</span>
									<span class="font-mono text-[10px] text-fg-muted">
										{formatChatTime(msg.createdAt)}
									</span>
								</div>
								<p class="font-mono text-xs text-fg-dark">
									{msg.content}
								</p>
							</div>
						{/each}
					{/if}
				</div>

				<!-- Send message -->
				<form
					class="flex gap-2 border-t border-border p-3"
					onsubmit={(e) => {
						e.preventDefault();
						sendChatMessage();
					}}
				>
					<input
						type="text"
						bind:value={newChatMessage}
						placeholder="message..."
						class="flex-1 border border-border bg-bg px-2 py-1 font-mono text-xs text-fg outline-none focus:border-primary"
					/>
					<button
						type="submit"
						disabled={!newChatMessage.trim() || isSendingChat}
						class="cursor-pointer border border-primary px-2 py-1 font-mono text-xs text-primary transition-colors hover:bg-primary hover:text-bg-dark disabled:cursor-not-allowed disabled:opacity-50"
					>
						{isSendingChat ? '...' : '>'}
					</button>
				</form>
			</div>
		{/if}
	</div>
</div>

<!-- Share dialog (shown after password regeneration) -->
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
			<h2 class="text-sm font-bold text-fg">new password generated</h2>
			<p class="text-xs text-fg-muted">
				The old password no longer works. Share this new password with your
				contributor. It is shown only once.
			</p>

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
	oncancel={() => (showDeleteConfirm = false)}
/>
