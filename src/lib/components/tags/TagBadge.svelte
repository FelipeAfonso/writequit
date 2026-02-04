<script lang="ts">
	interface Props {
		name: string;
		color?: string;
		type?: string;
		/** Show the +prefix before the tag name. */
		showPrefix?: boolean;
		/** Make the badge clickable. */
		onclick?: () => void;
		/** Whether this tag is currently active/selected in a filter. */
		active?: boolean;
	}

	let {
		name,
		color,
		type,
		showPrefix = true,
		onclick,
		active = false
	}: Props = $props();

	/** Map tag types to default colors when no custom color is set. */
	const TYPE_COLORS: Record<string, string> = {
		priority: 'var(--color-red)',
		project: 'var(--color-blue)',
		category: 'var(--color-magenta)',
		context: 'var(--color-teal)'
	};

	let resolvedColor = $derived(
		color ?? (type ? TYPE_COLORS[type] : undefined) ?? 'var(--color-teal)'
	);
</script>

{#if onclick}
	<button
		type="button"
		class="inline-flex items-center border px-1.5 py-0.5 font-mono text-xs transition-colors"
		class:opacity-50={!active}
		style="border-color: {resolvedColor}; color: {resolvedColor};"
		onclick={() => onclick?.()}
	>
		{#if showPrefix}<span class="opacity-50">+</span>{/if}{name}
	</button>
{:else}
	<span
		class="inline-flex items-center border px-1.5 py-0.5 font-mono text-xs"
		style="border-color: {resolvedColor}; color: {resolvedColor};"
	>
		{#if showPrefix}<span class="opacity-50">+</span>{/if}{name}
	</span>
{/if}
