<script lang="ts">
	import { commandPalette } from '$lib/stores/commandPalette.svelte';
	import {
		matchCommands,
		executeCommand,
		type Command
	} from '$lib/utils/commands';

	let inputEl: HTMLInputElement | undefined = $state();
	let input = $state('');
	let selectedIndex = $state(0);

	let suggestions = $derived(matchCommands(input));

	// Focus input when palette opens
	$effect(() => {
		if (commandPalette.isOpen) {
			// Reset state on open (use initialInput if provided)
			input = commandPalette.initialInput;
			selectedIndex = 0;
			// Tick to let the DOM render, then focus
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

	function close() {
		commandPalette.close();
	}

	async function execute(value?: string) {
		const toRun = value ?? input;
		if (!toRun.trim()) {
			close();
			return;
		}

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
					// No input typed, but a suggestion is highlighted
					execute(suggestions[selectedIndex].aliases[0]);
				} else if (
					suggestions.length === 1 &&
					input.trim() &&
					!input.includes(' ')
				) {
					// Single match and no args yet — use the matched alias
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
				selectedIndex = Math.max(0, selectedIndex - 1);
				break;

			case 'ArrowDown':
				e.preventDefault();
				selectedIndex = Math.min(suggestions.length - 1, selectedIndex + 1);
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

	function selectSuggestion(cmd: Command) {
		if (cmd.args === 'none') {
			execute(cmd.aliases[0]);
		} else {
			input = cmd.aliases[0] + ' ';
			inputEl?.focus();
		}
	}
</script>

{#if commandPalette.isOpen}
	<!-- Backdrop (click to close) -->
	<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
	<div class="fixed inset-0 z-50" onclick={close}>
		<!-- Palette bar at bottom -->
		<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
		<div
			class="fixed right-0 bottom-0 left-0 z-50 flex flex-col"
			onclick={(e) => e.stopPropagation()}
		>
			<!-- Suggestions dropdown (renders upward) -->
			{#if suggestions.length > 0 && !(suggestions.length === 1 && input.includes(' '))}
				<div class="border-x border-t border-border-highlight bg-surface-1">
					{#each suggestions as cmd, i (cmd.name)}
						<button
							type="button"
							class="flex w-full items-center gap-3 px-4 py-1.5 text-left font-mono text-xs transition-colors"
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

			<!-- Input bar -->
			<div
				class="flex items-center border-t border-border-highlight bg-surface-1 px-4 py-2"
			>
				<span class="mr-1 font-mono text-sm text-primary">:</span>
				<input
					bind:this={inputEl}
					bind:value={input}
					onkeydown={handleKeydown}
					type="text"
					class="flex-1 border-none bg-transparent font-mono text-sm text-fg outline-none placeholder:text-fg-muted"
					placeholder="type a command..."
					spellcheck="false"
					autocomplete="off"
				/>
				{#if commandPalette.error}
					<span class="font-mono text-xs text-red">
						{commandPalette.error}
					</span>
				{/if}
			</div>
		</div>
	</div>
{/if}
