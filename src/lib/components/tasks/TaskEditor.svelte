<script lang="ts">
	import { onMount } from 'svelte';
	import {
		EditorView,
		drawSelection,
		placeholder as cmPlaceholder,
		keymap
	} from '@codemirror/view';
	import { EditorState, Compartment } from '@codemirror/state';
	import { markdown } from '@codemirror/lang-markdown';
	import { languages } from '@codemirror/language-data';
	import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
	import { searchKeymap } from '@codemirror/search';
	import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
	import { vim, getCM, Vim } from '@replit/codemirror-vim';
	import { tokyoNight } from '$lib/components/ui/codemirror-theme';
	import {
		tagCompletionSource,
		type TagOption
	} from '$lib/components/tasks/tagCompletion';
	import { getContext } from 'svelte';
	import { commandPalette } from '$lib/stores/commandPalette.svelte';
	import { parseTask } from '$lib/parser';
	import type { ParsedTask } from '$lib/parser';
	import {
		formatDate,
		TIMEZONE_CTX,
		type TimezoneGetter
	} from '$lib/utils/datetime';

	interface Props {
		/** Called when the user submits (Ctrl/Cmd+Enter). */
		onsubmit?: (rawContent: string) => void;
		/** Initial content to populate the editor with. */
		initialContent?: string;
		/** Placeholder text shown when the editor is empty. */
		placeholder?: string;
		/** Whether the editor should autofocus on mount. */
		autofocus?: boolean;
		/** Enable vim keybindings in the editor. */
		viMode?: boolean;
		/** Available tags for autocomplete suggestions. */
		tags?: TagOption[];
	}

	let {
		onsubmit,
		initialContent = '',
		placeholder = '# Task title\nDescribe your task... +tag due:tomorrow',
		autofocus = true,
		viMode = false,
		tags = []
	}: Props = $props();

	const getTz = getContext<TimezoneGetter>(TIMEZONE_CTX);
	let timezone = $derived(getTz());

	let editorContainer: HTMLDivElement | undefined = $state();
	let view: EditorView | undefined = $state();
	let preview: ParsedTask | null = $state(null);

	/** Current vim mode label for the status line. */
	let vimModeLabel = $state('NORMAL');

	// Compartment for dynamically toggling vim mode
	const vimCompartment = new Compartment();

	// Track last-configured viMode to avoid redundant reconfiguration
	// (which would reset vim's internal state, e.g. INSERT -> NORMAL)
	let lastConfiguredViMode: boolean | undefined;

	// Compartment for autocomplete (reconfigured when tags list changes)
	const autocompleteCompartment = new Compartment();

	/**
	 * Patch the vim adapter's `openDialog` so that pressing `:` in
	 * normal mode opens our command palette instead of vim's built-in
	 * command line.  Search (`/` and `?`) is left intact.
	 */
	function patchVimDialog(editorView: EditorView) {
		const cm = getCM(editorView);
		if (!cm) return;

		const origOpenDialog = cm.openDialog.bind(cm);

		cm.openDialog = (
			template: Element,
			callback: ((...args: unknown[]) => unknown) | undefined,
			options: Record<string, unknown>
		) => {
			// The vim ex-command dialog uses a template whose first
			// child's textContent is ":".  Intercept only that case.
			const label = template?.firstChild?.textContent ?? '';
			if (label === ':') {
				// Open the app command palette, blur the editor so
				// global shortcuts work normally.
				editorView.contentDOM.blur();
				commandPalette.open();
				// Return a no-op close function
				return () => {};
			}
			// Everything else (search `/`, `?`, etc.) goes through vim
			return origOpenDialog(template, callback, options);
		};
	}

	/** Read the current vim mode from the adapter state. */
	function readVimMode(editorView: EditorView): string {
		const cm = getCM(editorView);
		const vs = cm?.state?.vim;
		if (!vs) return 'NORMAL';
		if (vs.insertMode) return 'INSERT';
		if (vs.visualMode) {
			if (vs.visualBlock) return 'V-BLOCK';
			return 'VISUAL';
		}
		return 'NORMAL';
	}

	/**
	 * Register a vim normal-mode mapping so that pressing Escape
	 * when already in NORMAL mode blurs the editor.  We use the
	 * Vim API directly instead of a capture-phase DOM listener so
	 * there are no timing issues with compartment reconfigures.
	 */
	let vimEscapeRegistered = false;
	function registerVimEscape() {
		if (!vimEscapeRegistered) {
			Vim.defineEx('blurEditor', 'blurEditor', (cm: unknown) => {
				const adapter = cm as { cm6: EditorView };
				adapter.cm6.contentDOM.blur();
			});
			vimEscapeRegistered = true;
		}
		Vim.map('<Esc>', ':blurEditor<CR>', 'normal');
	}

	function unregisterVimEscape() {
		try {
			Vim.unmap('<Esc>', 'normal');
		} catch {
			// Ignore if not mapped
		}
	}

	/** Programmatically enter vim insert mode. */
	function enterInsertMode(editorView: EditorView) {
		const cm = getCM(editorView);
		if (cm) Vim.handleKey(cm, 'i', 'mapping');
	}

	/** Focus the editor (enters insert mode when vim is active). */
	export function focus(): void {
		if (!view) return;
		view.focus();
		if (viMode) enterInsertMode(view);
	}

	/** Get the current editor content. */
	function getContent(): string {
		if (!view) return '';
		return view.state.doc.toString();
	}

	/** Clear the editor and reset preview. */
	function clear(): void {
		if (!view) return;
		view.dispatch({
			changes: { from: 0, to: view.state.doc.length, insert: '' }
		});
		preview = null;
	}

	/** Submit handler: extract content, call callback, clear editor. */
	export function submit(): boolean {
		const content = getContent().trim();
		if (content.length === 0) return false;
		onsubmit?.(content);
		clear();
		return true;
	}

	/** Blur the editor. */
	export function blur(): void {
		view?.contentDOM.blur();
	}

	/** Build the escape keymap — only used when vim is OFF. */
	function makeEscapeKeymap() {
		return keymap.of([
			{
				key: 'Escape',
				run: (v) => {
					v.contentDOM.blur();
					return true;
				}
			}
		]);
	}

	// Compartment for the escape keymap (disabled when vim is on)
	const escapeCompartment = new Compartment();

	onMount(() => {
		if (!editorContainer) return;

		const submitKeymap = keymap.of([
			{
				key: 'Ctrl-Enter',
				run: () => {
					submit();
					return true;
				}
			},
			{
				key: 'Cmd-Enter',
				mac: 'Cmd-Enter',
				run: () => {
					submit();
					return true;
				}
			}
		]);

		const updateListener = EditorView.updateListener.of((update) => {
			if (update.docChanged) {
				const text = update.state.doc.toString();
				if (text.trim().length > 0) {
					preview = parseTask(text, timezone);
				} else {
					preview = null;
				}
			}
			// Track vim mode changes on every update
			if (viMode) {
				vimModeLabel = readVimMode(update.view);
			}
		});

		// Seed empty editor with '# ' on focus so the user starts with a title
		const seedOnFocus = EditorView.domEventHandlers({
			focusin(_, v) {
				if (v.state.doc.length === 0) {
					const insert = '# ';
					v.dispatch({
						changes: { from: 0, insert },
						selection: { anchor: insert.length }
					});
				}
			}
		});

		const state = EditorState.create({
			doc: initialContent,
			extensions: [
				vimCompartment.of(viMode ? vim() : []),
				submitKeymap,
				escapeCompartment.of(viMode ? [] : makeEscapeKeymap()),
				keymap.of([
					...completionKeymap,
					...defaultKeymap,
					...historyKeymap,
					...searchKeymap
				]),
				history(),
				autocompleteCompartment.of(
					autocompletion({
						activateOnTyping: true,
						override: [tagCompletionSource(() => tags)]
					})
				),
				markdown({ codeLanguages: languages }),
				drawSelection(),
				tokyoNight,
				cmPlaceholder(placeholder),
				updateListener,
				seedOnFocus,
				EditorView.lineWrapping
			]
		});

		view = new EditorView({
			state,
			parent: editorContainer
		});

		// Record what viMode we configured at mount time
		lastConfiguredViMode = viMode;

		// Patch vim's command-line dialog when vim is initially enabled
		if (viMode) {
			patchVimDialog(view);
		}

		// Map Escape in vim normal mode to blur the editor
		if (viMode) {
			registerVimEscape();
		}

		if (autofocus) {
			view.focus();
			if (viMode) enterInsertMode(view);
		}

		// Parse initial content if present
		if (initialContent.trim().length > 0) {
			preview = parseTask(initialContent, timezone);
		}

		return () => {
			if (viMode) unregisterVimEscape();
			view?.destroy();
		};
	});

	// React to viMode prop changes and reconfigure the compartments.
	// Skip when viMode hasn't actually changed (avoids resetting vim
	// internal state like INSERT mode on mount).
	$effect(() => {
		if (!view) return;
		if (viMode === lastConfiguredViMode) return;
		lastConfiguredViMode = viMode;

		view.dispatch({
			effects: [
				vimCompartment.reconfigure(viMode ? vim() : []),
				escapeCompartment.reconfigure(viMode ? [] : makeEscapeKeymap())
			]
		});
		// Re-patch the dialog override and escape mapping after vim is (re)enabled
		if (viMode) {
			patchVimDialog(view);
			registerVimEscape();
			// If the editor is focused, re-enter insert mode since
			// reconfigure created a fresh vim instance in NORMAL mode
			if (view.hasFocus) {
				enterInsertMode(view);
			}
		} else {
			unregisterVimEscape();
		}
	});

	// Reconfigure autocomplete when the tags list changes
	$effect(() => {
		if (!view) return;
		// Access `tags` so Svelte tracks the dependency
		const currentTags = tags;
		view.dispatch({
			effects: autocompleteCompartment.reconfigure(
				autocompletion({
					activateOnTyping: true,
					override: [tagCompletionSource(() => currentTags)]
				})
			)
		});
	});
</script>

<div class="flex flex-col gap-2">
	<!-- Editor -->
	<div
		class="border border-border bg-bg-dark focus-within:border-primary"
		bind:this={editorContainer}
	></div>

	<!-- Vim status line -->
	{#if viMode}
		<div
			class="-mt-2 flex items-center justify-between border-x border-b border-border bg-surface-1 px-2 py-0.5"
		>
			<span
				class="font-mono text-xs font-bold"
				class:text-green={vimModeLabel === 'NORMAL'}
				class:text-primary={vimModeLabel === 'INSERT'}
				class:text-magenta={vimModeLabel === 'VISUAL' ||
					vimModeLabel === 'V-BLOCK'}
			>
				-- {vimModeLabel} --
			</span>
		</div>
	{/if}

	<!-- Live preview bar -->
	{#if preview}
		<div
			class="flex flex-wrap items-center gap-3 px-2 py-1.5 font-mono text-xs text-fg-muted"
		>
			<span class="text-fg-dark" title="Extracted title">
				<span class="text-primary">title:</span>
				{preview.title}
			</span>

			{#if preview.dueDate !== null}
				<span title="Due date">
					<span class="text-warning">due:</span>
					{formatDate(preview.dueDate, timezone)}
				</span>
			{/if}

			{#if preview.tags.length > 0}
				<span class="flex items-center gap-1" title="Tags">
					{#each preview.tags as tag (tag)}
						<span
							class="border border-border-highlight bg-surface-2 px-1.5 py-0.5 text-teal"
						>
							+{tag}
						</span>
					{/each}
				</span>
			{/if}
		</div>
	{/if}

	<!-- Submit hint + button -->
	<div class="flex items-center justify-between px-1">
		<span class="font-mono text-xs text-fg-muted">
			ctrl+enter or :w to save
		</span>
		<button
			type="button"
			class="cursor-pointer border border-green bg-transparent px-3 py-1 font-mono text-xs text-green transition-colors hover:bg-green hover:text-bg-dark"
			onclick={submit}
		>
			:w
		</button>
	</div>
</div>
