<script lang="ts">
	import { fade } from 'svelte/transition';
	import { getDataProvider } from '$lib/types/context.js';
	import { commandPalette } from '$lib/stores/commandPalette.svelte';
	import {
		matchCommands,
		executeCommand,
		type Command
	} from '$lib/utils/commands';

	// ── Active session (from DataProvider) ─────────────────────────
	const provider = getDataProvider();
	const activeSession = provider.sessions.active();

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
		const session = activeSession.current;
		if (!session) return;
		const now = Date.now();
		const diff = now - session.startTime;
		elapsed = formatElapsed(diff);
	}

	$effect(() => {
		if (activeSession.current) {
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
			await provider.sessions.stop();
		} catch {
			// Handled by provider error reporting
		}
	}

	// ── Command palette logic ──────────────────────────────────────
	let inputEl: HTMLInputElement | undefined = $state();
	let input = $state('');
	let selectedIndex = $state(0);
	let suggestionsEl: HTMLDivElement | undefined = $state();

	let suggestions = $derived(matchCommands(input));

	// Whether we should show the suggestions panel
	let showSuggestions = $derived(suggestions.length > 0);

	// Focus input when palette opens
	$effect(() => {
		if (commandPalette.isOpen) {
			input = commandPalette.initialInput;
			selectedIndex = 0;
			requestAnimationFrame(() => {
				inputEl?.focus();
			});
		}
	});

	// Clamp selected index when suggestions change
	$effect(() => {
		if (selectedIndex >= suggestions.length) {
			selectedIndex = Math.max(0, suggestions.length - 1);
		}
	});

	// Scroll selected suggestion into view
	$effect(() => {
		if (!showSuggestions || !suggestionsEl) return;
		const buttons = suggestionsEl.querySelectorAll('[data-suggestion]');
		const el = buttons[selectedIndex];
		if (el) {
			el.scrollIntoView({ block: 'nearest' });
		}
	});

	function close() {
		commandPalette.close();
	}

	async function execute(value?: string) {
		const toRun = value ?? input;
		if (!toRun.trim()) {
			close();
			return;
		}

		// Push to history before executing
		commandPalette.pushHistory(toRun.trim());

		const err = await executeCommand(toRun, commandPalette.context);
		if (err) {
			commandPalette.error = err;
		} else {
			close();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		switch (e.key) {
			case 'Escape':
				e.preventDefault();
				close();
				break;

			case 'Enter':
				e.preventDefault();
				if (suggestions.length > 0 && !input.trim() && selectedIndex >= 0) {
					execute(suggestions[selectedIndex].aliases[0]);
				} else if (
					suggestions.length === 1 &&
					input.trim() &&
					!input.includes(' ')
				) {
					const match = suggestions[0];
					const parsed = input.trim().toLowerCase();
					const matchedAlias = match.aliases.find((a) => a.startsWith(parsed));
					execute(matchedAlias ?? match.aliases[0]);
				} else {
					execute();
				}
				break;

			case 'ArrowUp':
				e.preventDefault();
				if (showSuggestions) {
					selectedIndex = Math.max(0, selectedIndex - 1);
				} else {
					// Cycle command history
					const prev = commandPalette.historyUp(input);
					if (prev !== undefined) {
						input = prev;
					}
				}
				break;

			case 'ArrowDown':
				e.preventDefault();
				if (showSuggestions) {
					selectedIndex = Math.min(suggestions.length - 1, selectedIndex + 1);
				} else {
					// Cycle command history
					const next = commandPalette.historyDown();
					if (next !== undefined) {
						input = next;
					}
				}
				break;

			case 'Tab':
				e.preventDefault();
				if (suggestions.length > 0) {
					const selected = suggestions[selectedIndex];
					input = selected.aliases[0] + (selected.args !== 'none' ? ' ' : '');
				}
				break;
		}
	}

	function handleInput() {
		// Reset history browsing when user types
		commandPalette.resetHistoryIndex();
		// Clear error on input change
		if (commandPalette.error) {
			commandPalette.error = '';
		}
	}

	function selectSuggestion(cmd: Command) {
		if (cmd.args === 'none') {
			execute(cmd.aliases[0]);
		} else {
			input = cmd.aliases[0] + ' ';
			inputEl?.focus();
		}
	}

	function handleStart() {
		commandPalette.openWithInput('start ');
	}
</script>

<!-- Backdrop: transparent click-to-close when command mode is open -->
{#if commandPalette.isOpen}
	<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
	<div class="fixed inset-0 z-40" onclick={close}></div>
{/if}

<!-- The bottom bar — always visible -->
<div class="relative z-50 shrink-0">
	<!-- Suggestions panel (only in command mode) -->
	{#if commandPalette.isOpen && showSuggestions}
		<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
		<div
			bind:this={suggestionsEl}
			class="absolute right-0 bottom-full left-0 max-h-[33vh] overflow-y-auto border-x border-t border-border-highlight bg-surface-1"
			onclick={(e) => e.stopPropagation()}
			transition:fade={{ duration: 120 }}
		>
			{#each suggestions as cmd, i (cmd.name)}
				<button
					type="button"
					data-suggestion
					class="flex w-full cursor-pointer items-center gap-3 px-4 py-1.5 text-left font-mono text-xs transition-colors"
					class:bg-surface-2={i === selectedIndex}
					class:text-primary={i === selectedIndex}
					class:text-fg-dark={i !== selectedIndex}
					onmouseenter={() => (selectedIndex = i)}
					onclick={() => selectSuggestion(cmd)}
				>
					<span class="text-fg-muted">:</span>
					<span class="font-bold">{cmd.aliases[0]}</span>
					{#if cmd.argsPlaceholder}
						<span class="text-fg-muted">
							{cmd.argsPlaceholder}
						</span>
					{/if}
					<span class="ml-auto text-fg-muted">
						{cmd.description}
					</span>
				</button>
			{/each}
		</div>
	{/if}

	<!-- The bar itself — fixed height so all modes match -->
	<div
		class="relative h-8 border-t border-border-highlight bg-surface-1 font-mono text-xs"
	>
		<!-- Each mode is absolutely positioned so crossfade can overlap -->

		{#if commandPalette.isOpen}
			<!-- ── COMMAND MODE ────────────────────────────── -->
			<div
				class="absolute inset-0 flex items-center"
				transition:fade={{ duration: 120 }}
			>
				<div class="mx-auto flex w-full max-w-4xl items-center gap-3 px-4">
					<span class="text-primary">:</span>
					<input
						bind:this={inputEl}
						bind:value={input}
						onkeydown={handleKeydown}
						oninput={handleInput}
						type="text"
						class="flex-1 cursor-text border-none bg-transparent font-mono text-xs text-fg outline-none placeholder:text-fg-muted"
						placeholder="type a command..."
						spellcheck="false"
						autocomplete="off"
					/>
					{#if commandPalette.error}
						<span class="shrink-0 text-red">
							{commandPalette.error}
						</span>
					{/if}
				</div>
			</div>
		{/if}

		{#if !commandPalette.isOpen && activeSession.current}
			<!-- ── TIMER MODE ─────────────────────────────── -->
			{@const session = activeSession.current}
			<div
				class="absolute inset-0 flex items-center"
				transition:fade={{ duration: 120 }}
			>
				<div class="mx-auto flex w-full max-w-4xl items-center gap-3 px-4">
					<!-- Recording indicator -->
					<span class="inline-block h-2 w-2 animate-pulse bg-red"></span>

					<!-- Timer -->
					<a
						href="/app/sessions/{session.id}"
						class="cursor-pointer font-mono text-xs font-bold text-green transition-colors hover:text-teal"
					>
						{elapsed}
					</a>

					<!-- Tags -->
					{#if session.tagIds && session.tagIds.length > 0}
						<span class="text-fg-muted">|</span>
						<span class="text-fg-muted">
							{session.tagIds.length} tag{session.tagIds.length !== 1
								? 's'
								: ''}
						</span>
					{/if}

					<!-- Description -->
					{#if session.description}
						<span class="text-fg-muted">|</span>
						<span class="truncate text-fg-dark">
							"{session.description}"
						</span>
					{/if}

					<!-- Task count -->
					{#if session.taskIds && session.taskIds.length > 0}
						<span class="text-fg-muted">|</span>
						<span class="text-fg-muted">
							{session.taskIds.length} task{session.taskIds.length !== 1
								? 's'
								: ''}
						</span>
					{/if}

					<!-- Spacer -->
					<div class="flex-1"></div>

					<!-- Stop button -->
					<button
						onclick={handleStop}
						class="cursor-pointer border border-red/50 px-2 py-0.5 font-mono text-xs text-red transition-colors hover:border-red hover:bg-red hover:text-bg-dark"
					>
						:stop
					</button>
				</div>
			</div>
		{/if}

		{#if !commandPalette.isOpen && !activeSession.current}
			<!-- ── IDLE MODE ──────────────────────────────── -->
			<div
				class="absolute inset-0 flex items-center"
				transition:fade={{ duration: 120 }}
			>
				<div class="mx-auto flex w-full max-w-4xl items-center gap-3 px-4">
					<button
						onclick={() => commandPalette.open()}
						class="cursor-pointer text-fg-muted transition-colors hover:text-fg-dark"
					>
						<span class="text-primary">:</span>
						command
					</button>
					<button
						onclick={() => {
							commandPalette.context.toggleHelp();
						}}
						class="cursor-pointer text-fg-muted transition-colors hover:text-fg-dark"
					>
						<span class="text-primary">?</span>
						help
					</button>
					<button
						onclick={() => commandPalette.openWithInput('s ')}
						class="cursor-pointer text-fg-muted transition-colors hover:text-fg-dark"
					>
						<span class="text-primary">/</span>
						search
					</button>

					<!-- Spacer -->
					<div class="flex-1"></div>

					<!-- Start timer button -->
					<button
						onclick={handleStart}
						class="cursor-pointer border border-green/50 px-2 py-0.5 font-mono text-xs text-green transition-colors hover:border-green hover:bg-green hover:text-bg-dark"
					>
						:start
					</button>
				</div>
			</div>
		{/if}
	</div>
</div>
