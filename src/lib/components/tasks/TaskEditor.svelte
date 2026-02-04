<script lang="ts">
	import { onMount } from 'svelte';
	import {
		EditorView,
		placeholder as cmPlaceholder,
		keymap
	} from '@codemirror/view';
	import { EditorState, Compartment } from '@codemirror/state';
	import { markdown } from '@codemirror/lang-markdown';
	import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
	import { searchKeymap } from '@codemirror/search';
	import { vim, getCM } from '@replit/codemirror-vim';
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

	/** Focus the editor. */
	export function focus(): void {
		view?.focus();
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
	function submit(): void {
		const content = getContent().trim();
		if (content.length === 0) return;
		onsubmit?.(content);
		clear();
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
		});

		const state = EditorState.create({
			doc: initialContent,
			extensions: [
				vimCompartment.of(viMode ? vim() : []),
				submitKeymap,
				escapeCompartment.of(viMode ? [] : makeEscapeKeymap()),
				keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
				history(),
				markdown(),
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

		if (autofocus) {
			view.focus();
		}

		// Parse initial content if present
		if (initialContent.trim().length > 0) {
			preview = parseTask(initialContent);
		}

		return () => {
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
