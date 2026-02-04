<script lang="ts">
	import { marked } from 'marked';
	import DOMPurify from 'dompurify';

	interface Props {
		/** Raw markdown string to render. */
		content: string;
	}

	let { content }: Props = $props();

	let html = $derived(DOMPurify.sanitize(marked.parse(content) as string));
</script>

<!-- eslint-disable svelte/no-at-html-tags -- sanitized with DOMPurify -->
<div class="markdown font-mono text-sm leading-relaxed text-fg-dark">
	{@html html}
</div>

<style>
	.markdown :global(h1) {
		font-size: 1.4em;
		font-weight: bold;
		color: var(--color-blue);
		margin: 0.5em 0 0.25em;
	}

	.markdown :global(h2) {
		font-size: 1.2em;
		font-weight: bold;
		color: var(--color-cyan);
		margin: 0.5em 0 0.25em;
	}

	.markdown :global(h3) {
		font-size: 1.1em;
		font-weight: bold;
		color: var(--color-magenta);
		margin: 0.5em 0 0.25em;
	}

	.markdown :global(h4),
	.markdown :global(h5),
	.markdown :global(h6) {
		font-weight: bold;
		color: var(--color-purple);
		margin: 0.5em 0 0.25em;
	}

	.markdown :global(p) {
		margin: 0.4em 0;
	}

	.markdown :global(a) {
		color: var(--color-blue);
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.markdown :global(a:hover) {
		color: var(--color-cyan);
	}

	.markdown :global(strong) {
		color: var(--color-fg);
		font-weight: bold;
	}

	.markdown :global(em) {
		color: var(--color-fg);
		font-style: italic;
	}

	.markdown :global(del) {
		color: var(--color-fg-muted);
		text-decoration: line-through;
	}

	.markdown :global(code) {
		background-color: var(--color-surface-2);
		border: 1px solid var(--color-border);
		padding: 0.1em 0.35em;
		font-size: 0.9em;
		color: var(--color-green);
	}

	.markdown :global(pre) {
		background-color: var(--color-bg-dark);
		border: 1px solid var(--color-border);
		padding: 0.75em 1em;
		overflow-x: auto;
		margin: 0.5em 0;
	}

	.markdown :global(pre code) {
		background: none;
		border: none;
		padding: 0;
		color: var(--color-fg-dark);
	}

	.markdown :global(blockquote) {
		border-left: 2px solid var(--color-border-highlight);
		padding-left: 0.75em;
		color: var(--color-fg-muted);
		font-style: italic;
		margin: 0.5em 0;
	}

	.markdown :global(ul),
	.markdown :global(ol) {
		padding-left: 1.5em;
		margin: 0.4em 0;
	}

	.markdown :global(ul) {
		list-style-type: disc;
	}

	.markdown :global(ol) {
		list-style-type: decimal;
	}

	.markdown :global(li) {
		margin: 0.15em 0;
	}

	.markdown :global(li::marker) {
		color: var(--color-orange);
	}

	.markdown :global(hr) {
		border: none;
		border-top: 1px solid var(--color-border);
		margin: 0.75em 0;
	}

	.markdown :global(table) {
		border-collapse: collapse;
		width: 100%;
		margin: 0.5em 0;
	}

	.markdown :global(th),
	.markdown :global(td) {
		border: 1px solid var(--color-border);
		padding: 0.3em 0.6em;
		text-align: left;
	}

	.markdown :global(th) {
		background-color: var(--color-surface-2);
		color: var(--color-fg);
		font-weight: bold;
	}

	.markdown :global(img) {
		max-width: 100%;
	}

	/* Remove margin on first/last children for tighter layout */
	.markdown :global(:first-child) {
		margin-top: 0;
	}

	.markdown :global(:last-child) {
		margin-bottom: 0;
	}
</style>
