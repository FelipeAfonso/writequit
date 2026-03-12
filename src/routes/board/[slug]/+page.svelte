<script lang="ts">
	import { page } from '$app/state';
	import { ConvexClient } from 'convex/browser';
	import { PUBLIC_CONVEX_URL } from '$env/static/public';
	import { api } from '$convex/_generated/api';
	import TagBadge from '$lib/components/tags/TagBadge.svelte';
	import TaskStatusBadge from '$lib/components/tasks/TaskStatusBadge.svelte';
	import Markdown from '$lib/components/ui/Markdown.svelte';
	import { stripMetadata } from '$lib/parser';
	import { SvelteMap } from 'svelte/reactivity';
	import { onDestroy } from 'svelte';

	const slug = page.params.slug ?? '';

	// ── Auth state ─────────────────────────────────────────────────
	let password = $state('');
	let displayName = $state('');
	let isAuthenticated = $state(false);
	let authError = $state('');
	let isLoading = $state(false);

	// ── Board data ─────────────────────────────────────────────────
	let boardData = $state<{
		board: { _id: string; name: string };
		tasks: Array<{
			_id: string;
			title: string;
			rawContent: string;
			status: 'inbox' | 'active' | 'done';
			dueDate?: number;
			tagIds: string[];
			tags: Array<{
				_id: string;
				name: string;
				color?: string;
				type?: string;
			}>;
			createdAt: number;
			updatedAt: number;
		}>;
		priorityTags: Array<{
			_id: string;
			name: string;
			color?: string;
			type?: string;
		}>;
	} | null>(null);

	// ── Comments state ─────────────────────────────────────────────
	let expandedTaskId = $state<string | null>(null);
	let taskComments = new SvelteMap<
		string,
		Array<{
			_id: string;
			authorName: string;
			content: string;
			createdAt: number;
		}>
	>();
	let newComment = $state('');
	let commentLoading = $state(false);
	let isAddingComment = $state(false);

	// ── Convex client for real-time subscriptions ──────────────────
	let convexClient: ConvexClient | null = null;
	let unsubscribe: (() => void) | null = null;

	const STORAGE_KEY = `wq_board_${slug}`;

	// Attempt to restore session from localStorage
	if (typeof window !== 'undefined') {
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored) {
				const parsed = JSON.parse(stored);
				password = parsed.password;
				displayName = parsed.displayName;
				// Will attempt auth on mount
				attemptAuth(parsed.password, parsed.displayName);
			}
		} catch {
			// Invalid stored data
		}
	}

	function setupRealtimeSubscription(pw: string) {
		convexClient = new ConvexClient(PUBLIC_CONVEX_URL);
		unsubscribe = convexClient.onUpdate(
			api.boards.publicGetBySlug,
			{ slug, password: pw },
			(result) => {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				boardData = result as any;
			}
		);
	}

	async function attemptAuth(pw: string, name: string) {
		isLoading = true;
		authError = '';

		try {
			// Create a temporary client to validate
			const tempClient = new ConvexClient(PUBLIC_CONVEX_URL);
			const result = await tempClient.query(api.boards.publicGetBySlug, {
				slug,
				password: pw
			});
			await tempClient.close();

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			boardData = result as any;
			password = pw;
			displayName = name;
			isAuthenticated = true;

			// Persist to localStorage
			if (typeof window !== 'undefined') {
				localStorage.setItem(
					STORAGE_KEY,
					JSON.stringify({
						password: pw,
						displayName: name
					})
				);
			}

			// Setup real-time subscription
			setupRealtimeSubscription(pw);
		} catch (error) {
			const msg =
				error instanceof Error ? error.message : 'Authentication failed';
			if (msg.includes('Invalid password')) {
				authError = 'invalid password';
			} else if (msg.includes('not active')) {
				authError = 'this board is not active';
			} else if (msg.includes('not found')) {
				authError = 'board not found';
			} else {
				authError = msg;
			}
			isAuthenticated = false;

			// Clear stored credentials on auth failure
			if (typeof window !== 'undefined') {
				localStorage.removeItem(STORAGE_KEY);
			}
		} finally {
			isLoading = false;
		}
	}

	function handleLogin(e: SubmitEvent) {
		e.preventDefault();
		const pw = password.trim();
		const name = displayName.trim();
		if (!pw || !name) return;
		attemptAuth(pw, name);
	}

	function handleLogout() {
		isAuthenticated = false;
		boardData = null;
		password = '';
		displayName = '';
		authError = '';
		if (typeof window !== 'undefined') {
			localStorage.removeItem(STORAGE_KEY);
		}
		if (unsubscribe) {
			unsubscribe();
			unsubscribe = null;
		}
		if (convexClient) {
			convexClient.close();
			convexClient = null;
		}
	}

	onDestroy(() => {
		if (unsubscribe) unsubscribe();
		if (convexClient) convexClient.close();
	});

	// ── Priority tag handling ──────────────────────────────────────

	function getCurrentPriorityTag(
		task: NonNullable<typeof boardData>['tasks'][number]
	): NonNullable<typeof boardData>['priorityTags'][number] | null {
		if (!boardData) return null;
		for (const tag of task.tags) {
			if (tag.type === 'priority') return tag;
		}
		return null;
	}

	async function setPriority(
		taskId: string,
		newPriorityTagId: string,
		oldPriorityTagId?: string
	) {
		if (!convexClient) return;
		try {
			/* eslint-disable @typescript-eslint/no-explicit-any */
			await convexClient.mutation(api.boards.publicSetPriority, {
				slug,
				password,
				taskId: taskId as any,
				priorityTagId: newPriorityTagId as any,
				oldPriorityTagId: oldPriorityTagId
					? (oldPriorityTagId as any)
					: undefined
			});
			/* eslint-enable @typescript-eslint/no-explicit-any */
		} catch (error) {
			console.error('Failed to set priority:', error);
		}
	}

	// ── Comments ───────────────────────────────────────────────────

	async function toggleComments(taskId: string) {
		if (expandedTaskId === taskId) {
			expandedTaskId = null;
			return;
		}

		expandedTaskId = taskId;
		await loadComments(taskId);
	}

	async function loadComments(taskId: string) {
		if (!convexClient) return;
		commentLoading = true;
		try {
			const result = await convexClient.query(api.boards.publicGetComments, {
				slug,
				password,
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				taskId: taskId as any
			});
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			taskComments.set(taskId, result as any);
		} catch (error) {
			console.error('Failed to load comments:', error);
		} finally {
			commentLoading = false;
		}
	}

	async function addComment(taskId: string) {
		if (!convexClient || !newComment.trim() || isAddingComment) return;
		isAddingComment = true;
		try {
			await convexClient.mutation(api.boards.publicAddComment, {
				slug,
				password,
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				taskId: taskId as any,
				authorName: displayName,
				content: newComment.trim()
			});
			newComment = '';
			// Reload comments
			await loadComments(taskId);
		} catch (error) {
			console.error('Failed to add comment:', error);
		} finally {
			isAddingComment = false;
		}
	}

	function formatDate(ms: number): string {
		return new Date(ms).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatDueDate(ms: number): string {
		return new Date(ms).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function isOverdue(ms: number): boolean {
		return ms < Date.now();
	}
</script>

<svelte:head>
	<title>{boardData?.board.name ?? 'board'} | :wq</title>
</svelte:head>

{#if !isAuthenticated}
	<!-- Password gate -->
	<div
		class="flex min-h-screen items-center justify-center bg-bg-dark p-6 font-mono"
	>
		<div class="flex w-full max-w-sm flex-col gap-6">
			<div class="flex flex-col gap-2">
				<h1 class="text-lg font-bold text-green">:wq</h1>
				<p class="text-sm text-fg-muted">shared board</p>
			</div>

			<form onsubmit={handleLogin} class="flex flex-col gap-4">
				<div class="flex flex-col gap-1">
					<label for="display-name" class="text-xs text-fg-muted">
						<span class="text-green">&gt;</span>
						display name
					</label>
					<input
						id="display-name"
						type="text"
						bind:value={displayName}
						placeholder="your name"
						autocomplete="off"
						class="border border-border bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-primary"
					/>
				</div>

				<div class="flex flex-col gap-1">
					<label for="password" class="text-xs text-fg-muted">
						<span class="text-green">&gt;</span>
						access key
					</label>
					<input
						id="password"
						type="password"
						bind:value={password}
						placeholder="enter access key"
						autocomplete="off"
						class="border border-border bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-primary"
					/>
				</div>

				{#if authError}
					<p class="text-xs text-red">{authError}</p>
				{/if}

				<button
					type="submit"
					disabled={isLoading || !password.trim() || !displayName.trim()}
					class="cursor-pointer border border-green px-4 py-2 text-sm text-green transition-colors hover:bg-green hover:text-bg-dark disabled:cursor-not-allowed disabled:opacity-50"
				>
					{isLoading ? 'verifying...' : 'enter'}
				</button>
			</form>
		</div>
	</div>
{:else if boardData}
	<!-- Board view -->
	<div class="min-h-screen bg-bg-dark">
		<!-- Header -->
		<header
			class="flex items-center justify-between border-b border-border px-4 py-2"
		>
			<div class="flex items-center gap-3">
				<span class="font-mono text-sm font-bold text-green">:wq</span>
				<span class="font-mono text-sm text-fg">{boardData.board.name}</span>
			</div>
			<div class="flex items-center gap-3">
				<span class="font-mono text-xs text-fg-muted">
					{displayName}
				</span>
				<button
					type="button"
					onclick={handleLogout}
					class="cursor-pointer font-mono text-xs text-fg-muted transition-colors hover:text-red"
				>
					exit
				</button>
			</div>
		</header>

		<!-- Task list -->
		<div class="mx-auto max-w-3xl p-6">
			<div class="mb-4 flex items-baseline gap-3">
				<h2 class="font-mono text-sm font-bold text-fg-muted">
					{boardData.tasks.length} task{boardData.tasks.length !== 1 ? 's' : ''}
				</h2>
				{#if boardData.priorityTags.length > 0}
					<span class="font-mono text-xs text-fg-muted">
						priorities: {boardData.priorityTags.map((t) => t.name).join(', ')}
					</span>
				{/if}
			</div>

			<div class="flex flex-col gap-2">
				{#each boardData.tasks as task (task._id)}
					{@const currentPriority = getCurrentPriorityTag(task)}
					{@const comments = taskComments.get(task._id)}
					<div
						class="flex flex-col border border-border bg-surface-0 font-mono"
					>
						<!-- Task header -->
						<div class="flex items-start gap-3 px-3 py-2.5">
							<TaskStatusBadge status={task.status} />

							<div class="flex min-w-0 flex-1 flex-col gap-1">
								<span
									class="text-sm"
									class:text-fg={task.status !== 'done'}
									class:text-fg-muted={task.status === 'done'}
									class:line-through={task.status === 'done'}
								>
									{task.title}
								</span>

								<!-- Tags -->
								{#if task.tags.length > 0 || task.dueDate}
									<div class="flex flex-wrap items-center gap-2">
										{#each task.tags as tag (tag._id)}
											<TagBadge
												name={tag.name}
												color={tag.color}
												type={tag.type}
												showPrefix={true}
											/>
										{/each}
										{#if task.dueDate}
											<span
												class="text-xs"
												class:text-warning={!isOverdue(task.dueDate)}
												class:text-red={isOverdue(task.dueDate)}
											>
												due:{formatDueDate(task.dueDate)}
											</span>
										{/if}
									</div>
								{/if}

								<!-- Task body (rendered markdown, stripped of metadata) -->
								{#if task.rawContent.includes('\n')}
									{@const bodyContent = stripMetadata(
										task.rawContent.split('\n').slice(1).join('\n')
									)}
									{#if bodyContent.trim().length > 0}
										<div class="mt-1 border-l-2 border-border pl-3">
											<Markdown content={bodyContent} />
										</div>
									{/if}
								{/if}
							</div>

							<!-- Priority selector + comment toggle -->
							<div class="flex shrink-0 flex-col items-end gap-1">
								{#if boardData.priorityTags.length > 0}
									<div class="flex gap-0.5">
										{#each boardData.priorityTags as pTag (pTag._id)}
											<button
												type="button"
												class="cursor-pointer border px-1.5 py-0.5 text-xs transition-colors {currentPriority?._id ===
												pTag._id
													? 'border-red bg-red/10 text-red'
													: 'border-border text-fg-muted'}"
												onclick={() =>
													setPriority(task._id, pTag._id, currentPriority?._id)}
												title="Set priority: {pTag.name}"
											>
												{pTag.name}
											</button>
										{/each}
									</div>
								{/if}

								<button
									type="button"
									class="cursor-pointer text-xs transition-colors"
									class:text-primary={expandedTaskId === task._id}
									class:text-fg-muted={expandedTaskId !== task._id}
									onclick={() => toggleComments(task._id)}
								>
									{expandedTaskId === task._id
										? '[-] comments'
										: '[+] comments'}
								</button>
							</div>
						</div>

						<!-- Comments section -->
						{#if expandedTaskId === task._id}
							<div class="border-t border-border bg-surface-1 px-3 py-2">
								{#if commentLoading}
									<p class="text-xs text-fg-muted">loading...</p>
								{:else if comments && comments.length > 0}
									<div class="mb-3 flex flex-col gap-2">
										{#each comments as comment (comment._id)}
											<div class="flex flex-col gap-0.5">
												<div class="flex items-baseline gap-2">
													<span class="text-xs font-bold text-primary">
														{comment.authorName}
													</span>
													<span class="text-[10px] text-fg-muted">
														{formatDate(comment.createdAt)}
													</span>
												</div>
												<p class="text-xs text-fg-dark">
													{comment.content}
												</p>
											</div>
										{/each}
									</div>
								{:else}
									<p class="mb-3 text-xs text-fg-muted">no comments yet</p>
								{/if}

								<!-- Add comment -->
								<form
									class="flex gap-2"
									onsubmit={(e) => {
										e.preventDefault();
										addComment(task._id);
									}}
								>
									<input
										type="text"
										bind:value={newComment}
										placeholder="add a comment..."
										class="flex-1 border border-border bg-bg px-2 py-1 text-xs text-fg outline-none focus:border-primary"
									/>
									<button
										type="submit"
										disabled={!newComment.trim() || isAddingComment}
										class="cursor-pointer border border-primary px-2 py-1 text-xs text-primary transition-colors hover:bg-primary hover:text-bg-dark disabled:cursor-not-allowed disabled:opacity-50"
									>
										{isAddingComment ? '...' : 'send'}
									</button>
								</form>
							</div>
						{/if}
					</div>
				{/each}
			</div>

			{#if boardData.tasks.length === 0}
				<div class="py-8 text-center font-mono text-sm text-fg-muted">
					no tasks on this board
				</div>
			{/if}
		</div>
	</div>
{/if}
