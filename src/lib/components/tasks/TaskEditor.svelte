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
	import { vim, getCM, Vim } from '@replit/codemirror-vim';
	import { tokyoNight } from '$lib/components/ui/codemirror-theme';
	import { commandPalette } from '$lib/stores/commandPalette.svelte';
	import { parseTask } from '$lib/parser';
	import type { ParsedTask } from '$lib/parser';

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
	}

	let {
		onsubmit,
		initialContent = '',
		placeholder = '# Task title\nDescribe your task... +tag due:tomorrow',
		autofocus = true,
		viMode = false
	}: Props = $props();

	let editorContainer: HTMLDivElement | undefined = $state();
	let view: EditorView | undefined = $state();
	let preview: ParsedTask | null = $state(null);

	/** Current vim mode label for the status line. */
	let vimModeLabel = $state('NORMAL');

	// Compartment for dynamically toggling vim mode
	const vimCompartment = new Compartment();

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
	 * In vim mode, Escape in normal mode should blur the editor.
	 * We listen on keydown *before* vim processes the key so we can
	 * check the mode at press-time: if already NORMAL, blur.
	 */
	function handleVimEscape(e: KeyboardEvent) {
		if (!viMode || !view) return;
		if (e.key !== 'Escape') return;
		const mode = readVimMode(view);
		if (mode === 'NORMAL') {
			e.preventDefault();
			view.contentDOM.blur();
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
					preview = parseTask(text);
				} else {
					preview = null;
				}
			}
			// Track vim mode changes on every update
			if (viMode) {
				vimModeLabel = readVimMode(update.view);
			}
		});

		const state = EditorState.create({
			doc: initialContent,
			extensions: [
				vimCompartment.of(viMode ? vim() : []),
				submitKeymap,
				escapeCompartment.of(viMode ? [] : makeEscapeKeymap()),
				keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
				history(),
				markdown({ codeLanguages: languages }),
				drawSelection(),
				tokyoNight,
				cmPlaceholder(placeholder),
				updateListener,
				EditorView.lineWrapping
			]
		});

		view = new EditorView({
			state,
			parent: editorContainer
		});

		// Patch vim's command-line dialog when vim is initially enabled
		if (viMode) {
			patchVimDialog(view);
		}

		// Blur on Escape when already in normal mode (capture phase
		// so we see the mode *before* vim processes the keypress).
		editorContainer.addEventListener('keydown', handleVimEscape, true);

		if (autofocus) {
			view.focus();
			if (viMode) enterInsertMode(view);
		}

		// Parse initial content if present
		if (initialContent.trim().length > 0) {
			preview = parseTask(initialContent);
		}

		return () => {
			editorContainer!.removeEventListener('keydown', handleVimEscape, true);
			view?.destroy();
		};
	});

	// React to viMode prop changes and reconfigure the compartments
	$effect(() => {
		if (!view) return;
		view.dispatch({
			effects: [
				vimCompartment.reconfigure(viMode ? vim() : []),
				escapeCompartment.reconfigure(viMode ? [] : makeEscapeKeymap())
			]
		});
		// Re-patch the dialog override after vim is (re)enabled
		if (viMode) {
			patchVimDialog(view);
		}
	});

	/**
	 * Format a UTC ms timestamp into a human-readable date string.
	 * Simple manual formatting — no Intl dependency.
	 */
	function formatDate(ms: number): string {
		const d = new Date(ms);
		const year = d.getUTCFullYear();
		const month = String(d.getUTCMonth() + 1).padStart(2, '0');
		const day = String(d.getUTCDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}
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
					{formatDate(preview.dueDate)}
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
		<span class="font-mono text-xs text-fg-muted">ctrl+enter to save</span>
		<button
			type="button"
			class="border border-green bg-transparent px-3 py-1 font-mono text-xs text-green transition-colors hover:bg-green hover:text-bg-dark"
			onclick={submit}
		>
			:w
		</button>
	</div>
</div>
