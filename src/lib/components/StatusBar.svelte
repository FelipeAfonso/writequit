<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';

	const client = useConvexClient();
	const activeSession = useQuery(api.sessions.active, {});

	let elapsed = $state('00:00:00');
	let intervalId: ReturnType<typeof setInterval> | undefined;

	function formatElapsed(ms: number): string {
		const totalSeconds = Math.floor(ms / 1000);
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;
		return [hours, minutes, seconds]
			.map((n) => String(n).padStart(2, '0'))
			.join(':');
	}

	function updateElapsed() {
		const session = activeSession.data;
		if (!session) return;
		const now = Date.now();
		const diff = now - session.startTime;
		elapsed = formatElapsed(diff);
	}

	$effect(() => {
		if (activeSession.data) {
			updateElapsed();
			intervalId = setInterval(updateElapsed, 1000);
		} else {
			elapsed = '00:00:00';
		}

		return () => {
			if (intervalId !== undefined) {
				clearInterval(intervalId);
				intervalId = undefined;
			}
		};
	});

	async function handleStop() {
		try {
			await client.mutation(api.sessions.stop, {});
		} catch {
			// Handled by Convex error reporting
		}
	}
</script>

{#if activeSession.data}
	{@const session = activeSession.data}
	<div
		class="fixed right-0 bottom-0 left-0 z-40 border-t border-green/30 bg-bg-dark/95 backdrop-blur-sm"
	>
		<div class="mx-auto flex max-w-4xl items-center gap-3 px-4 py-1.5">
			<!-- Recording indicator -->
			<span class="inline-block h-2 w-2 animate-pulse bg-red"></span>

			<!-- Timer -->
			<a
				href="/app/sessions/{session._id}"
				class="font-mono text-sm font-bold text-green transition-colors hover:text-teal"
			>
				{elapsed}
			</a>

			<!-- Tags -->
			{#if session.tagIds && session.tagIds.length > 0}
				<span class="text-fg-muted">|</span>
				<!-- We only have IDs here, not resolved tags, so display a simple count -->
				<span class="font-mono text-xs text-fg-muted">
					{session.tagIds.length} tag{session.tagIds.length !== 1 ? 's' : ''}
				</span>
			{/if}

			<!-- Description -->
			{#if session.description}
				<span class="text-fg-muted">|</span>
				<span class="truncate font-mono text-xs text-fg-dark">
					"{session.description}"
				</span>
			{/if}

			<!-- Task count -->
			{#if session.taskIds && session.taskIds.length > 0}
				<span class="text-fg-muted">|</span>
				<span class="font-mono text-xs text-fg-muted">
					{session.taskIds.length} task{session.taskIds.length !== 1 ? 's' : ''}
				</span>
			{/if}

			<!-- Spacer -->
			<div class="flex-1"></div>

			<!-- Stop button -->
			<button
				onclick={handleStop}
				class="border border-red/50 px-2 py-0.5 font-mono text-xs text-red transition-colors hover:border-red hover:bg-red hover:text-bg-dark"
			>
				:stop
			</button>
		</div>
	</div>
{/if}
