<script lang="ts">
	interface Props {
		/** Called when the user completes or skips the tutorial. */
		oncomplete: () => void;
	}

	let { oncomplete }: Props = $props();

	let step = $state(0);

	interface TutorialStep {
		title: string;
		lines: string[];
		highlight?: string;
	}

	const steps: TutorialStep[] = [
		{
			title: 'creating tasks',
			highlight: 'tasks',
			lines: [
				'type into the editor at the top of the tasks page',
				'to dump a new task into your inbox.',
				'',
				'use markdown for rich content:',
				'',
				'  fix the auth flow on /login',
				'  - [ ] check token expiry',
				'  - [ ] handle refresh',
				'',
				'add tags with + to organize:',
				'',
				'  refactor api layer +backend +urgent',
				'',
				"press Enter to save. that's it."
			]
		},
		{
			title: 'statuses & filters',
			highlight: 'workflow',
			lines: [
				'every task moves through three statuses:',
				'',
				'  [>] inbox    — freshly dumped, unsorted',
				"  [*] active   — you're working on it",
				'  [x] done     — shipped',
				'',
				'press x on a selected task to cycle:',
				'  inbox -> active -> done -> inbox',
				'',
				'use the filter bar to focus on a status,',
				'or filter by tags to narrow down further.',
				'',
				'tasks are sorted by status: active first,',
				'then inbox, then done.'
			]
		},
		{
			title: 'time tracking',
			highlight: 'sessions',
			lines: [
				'track your time with the command palette:',
				'',
				'  :start [desc] [+tag]  — start a timer',
				'  :stop                 — stop the timer',
				'  :log                  — log time manually',
				'',
				'a running timer appears in the status bar.',
				'',
				'tasks get linked to sessions automatically:',
				'moving a task to active or done while a',
				'timer is running links it to that session.',
				'',
				'you can also link tasks manually with:',
				'  :link <task-title>'
			]
		},
		{
			title: 'command palette',
			highlight: 'commands',
			lines: [
				'press : to open the command palette.',
				"it's the fastest way to do anything:",
				'',
				'  :new        — create a task',
				'  :start      — start a timer',
				'  :stop       — stop the timer',
				'  :log        — log time manually',
				'  :link       — link task to session',
				'  :settings   — open settings',
				'',
				'press / to search across all tasks.',
				'',
				'press ? to see all keyboard shortcuts.',
				'use g+key to navigate: g t (tasks),',
				'g s (sessions), g r (reports).'
			]
		}
	];

	const total = steps.length;

	function next() {
		if (step < total - 1) {
			step++;
		} else {
			oncomplete();
		}
	}

	function prev() {
		if (step > 0) step--;
	}

	function skip() {
		oncomplete();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowRight' || e.key === 'l' || e.key === 'Enter') {
			e.preventDefault();
			e.stopPropagation();
			next();
		} else if (e.key === 'ArrowLeft' || e.key === 'h') {
			e.preventDefault();
			e.stopPropagation();
			prev();
		} else if (e.key === 'Escape' || e.key === 'q') {
			e.preventDefault();
			e.stopPropagation();
			skip();
		}
	}

	let current = $derived(steps[step]);
	let isLast = $derived(step === total - 1);
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="fixed inset-0 z-[60] flex items-center justify-center bg-bg-dark/90 backdrop-blur-sm"
	onmousedown={skip}
>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="mx-4 flex w-full max-w-lg flex-col border border-border-highlight bg-surface-1 shadow-2xl"
		onmousedown={(e) => e.stopPropagation()}
	>
		<!-- Header -->
		<div
			class="flex items-center justify-between border-b border-border px-4 py-2.5"
		>
			<div class="flex items-center gap-2">
				<span class="font-mono text-xs text-green">:wq</span>
				<span class="font-mono text-xs text-fg-muted">tutorial</span>
			</div>
			<span class="font-mono text-xs text-fg-muted">
				[{step + 1}/{total}]
			</span>
		</div>

		<!-- Step title -->
		<div class="border-b border-border px-4 py-2">
			<div class="flex items-center gap-2">
				<span class="font-mono text-xs text-fg-muted">
					{current.highlight}
				</span>
				<span class="font-mono text-sm font-bold text-fg">
					{current.title}
				</span>
			</div>
		</div>

		<!-- Content -->
		<div class="px-4 py-4">
			<div class="flex flex-col gap-0">
				{#each current.lines as line, idx (idx)}
					{#if line === ''}
						<div class="h-3"></div>
					{:else if line.startsWith('  ')}
						<p class="font-mono text-xs leading-relaxed text-primary">
							{line}
						</p>
					{:else}
						<p class="font-mono text-xs leading-relaxed text-fg-dark">
							{line}
						</p>
					{/if}
				{/each}
			</div>
		</div>

		<!-- Progress bar -->
		<div class="px-4">
			<div class="flex gap-1">
				{#each steps as s, i (i)}
					<div
						class="h-0.5 flex-1 transition-colors"
						class:bg-primary={i <= step}
						class:bg-surface-3={i > step}
						title={s.title}
					></div>
				{/each}
			</div>
		</div>

		<!-- Footer -->
		<div class="flex items-center justify-between px-4 py-3">
			<button
				type="button"
				class="cursor-pointer font-mono text-xs text-fg-muted transition-colors hover:text-fg-dark"
				onclick={skip}
			>
				{isLast ? '' : 'skip'}
				<span class="ml-1 text-fg-muted opacity-50">esc</span>
			</button>

			<div class="flex items-center gap-2">
				{#if step > 0}
					<button
						type="button"
						class="cursor-pointer border border-border px-3 py-1 font-mono text-xs text-fg-muted transition-colors hover:border-border-highlight hover:text-fg-dark"
						onclick={prev}
					>
						&larr; prev
					</button>
				{/if}
				<button
					type="button"
					class="cursor-pointer border border-primary px-3 py-1 font-mono text-xs text-primary transition-colors hover:bg-primary hover:text-bg-dark"
					onclick={next}
				>
					{isLast ? 'done' : 'next ->'}
				</button>
			</div>
		</div>
	</div>
</div>
