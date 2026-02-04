<script lang="ts">
	import { onMount } from 'svelte';
	import {
		EditorView,
		placeholder as cmPlaceholder,
		keymap
	} from '@codemirror/view';
	import { EditorState } from '@codemirror/state';
	import { markdown } from '@codemirror/lang-markdown';
	import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
	import { searchKeymap } from '@codemirror/search';
	import { tokyoNight } from '$lib/components/ui/codemirror-theme';
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
	}

	let {
		onsubmit,
		initialContent = '',
		placeholder = '# Task title\nDescribe your task... +tag due:tomorrow',
		autofocus = true
	}: Props = $props();

	let editorContainer: HTMLDivElement | undefined = $state();
	let view: EditorView | undefined = $state();
	let preview: ParsedTask | null = $state(null);

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
			},
			{
				key: 'Escape',
				run: (v) => {
					v.contentDOM.blur();
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
				submitKeymap,
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
