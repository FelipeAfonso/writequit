<script lang="ts">
	import { goto } from '$app/navigation';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { isEditableTarget } from '$lib/utils/keys';

	const client = useConvexClient();
	const notifications = useQuery(api.notifications.list, {});

	let markingAll = $state(false);

	async function handleMarkAllRead() {
		markingAll = true;
		try {
			await client.mutation(api.notifications.markAllRead, {});
		} catch (err) {
			console.error('Failed to mark all read:', err);
		}
		markingAll = false;
	}

	type Notification = NonNullable<typeof notifications.data>[number];

	async function handleClick(notification: Notification) {
		// Mark as read
		if (!notification.isRead) {
			try {
				await client.mutation(api.notifications.markRead, {
					id: notification._id
				});
			} catch (err) {
				console.error('Failed to mark read:', err);
			}
		}

		// Navigate to relevant page
		if (
			notification.type === 'comment' ||
			notification.type === 'priority_change'
		) {
			if (notification.taskId) {
				goto(`/app/tasks/${notification.taskId}`);
			}
		} else if (notification.type === 'chat') {
			goto(`/app/boards/${notification.boardId}`);
		}
	}

	function typeLabel(type: string): string {
		switch (type) {
			case 'comment':
				return 'comment';
			case 'chat':
				return 'chat';
			case 'priority_change':
				return 'priority';
			default:
				return type;
		}
	}

	function typeColor(type: string): string {
		switch (type) {
			case 'comment':
				return 'text-cyan';
			case 'chat':
				return 'text-green';
			case 'priority_change':
				return 'text-orange';
			default:
				return 'text-fg-muted';
		}
	}

	function relativeTime(ms: number): string {
		const diff = Date.now() - ms;
		const seconds = Math.floor(diff / 1000);
		if (seconds < 60) return 'just now';
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		if (days < 30) return `${days}d ago`;
		return `${Math.floor(days / 30)}mo ago`;
	}

	// Keyboard shortcuts
	function handleKeydown(e: KeyboardEvent) {
		if (isEditableTarget(e)) return;
		if (e.key === 'a') {
			e.preventDefault();
			handleMarkAllRead();
		}
	}

	let hasUnread = $derived(
		notifications.data?.some((n: Notification) => !n.isRead) ?? false
	);
</script>

<svelte:head>
	<title>inbox | :wq</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="mx-auto max-w-3xl px-4 py-6">
	<!-- Header -->
	<div class="mb-4 flex items-center justify-between">
		<h1 class="font-mono text-sm font-bold text-fg">
			<span class="text-fg-muted">!</span>
			inbox
		</h1>
		{#if hasUnread}
			<button
				onclick={handleMarkAllRead}
				disabled={markingAll}
				class="cursor-pointer border border-transparent px-2 py-1 font-mono text-xs text-fg-muted transition-colors hover:border-border hover:text-fg-dark disabled:opacity-50"
			>
				{markingAll ? 'marking...' : 'mark all read (a)'}
			</button>
		{/if}
	</div>

	<!-- Notifications list -->
	{#if notifications.data === undefined}
		<p class="animate-pulse font-mono text-xs text-fg-muted">loading...</p>
	{:else if notifications.data.length === 0}
		<div class="border border-border px-4 py-8 text-center">
			<p class="font-mono text-sm text-fg-muted">no new notifications</p>
			<p class="mt-1 font-mono text-xs text-fg-muted opacity-60">
				comments, chats, and priority changes from boards will appear here
			</p>
		</div>
	{:else}
		<div class="flex flex-col">
			{#each notifications.data as notification (notification._id)}
				<button
					onclick={() => handleClick(notification)}
					class="group flex w-full cursor-pointer items-start gap-3 border-b border-border px-3 py-3 text-left font-mono transition-colors hover:bg-surface-1"
					class:opacity-50={notification.isRead}
				>
					<!-- Unread marker -->
					<span class="mt-0.5 w-2 shrink-0 text-xs leading-none">
						{#if !notification.isRead}
							<span class="text-primary">*</span>
						{/if}
					</span>

					<!-- Timestamp -->
					<span class="mt-0.5 w-16 shrink-0 text-right text-xs text-fg-muted">
						{relativeTime(notification.createdAt)}
					</span>

					<!-- Type badge -->
					<span
						class="mt-0.5 w-20 shrink-0 text-xs {typeColor(notification.type)}"
					>
						[{typeLabel(notification.type)}]
					</span>

					<!-- Summary -->
					<span
						class="flex-1 text-xs leading-relaxed"
						class:text-fg-dark={!notification.isRead}
						class:text-fg-muted={notification.isRead}
					>
						{notification.summary}
					</span>
				</button>
			{/each}
		</div>
	{/if}
</div>
