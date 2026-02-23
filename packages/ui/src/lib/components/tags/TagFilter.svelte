<script lang="ts">
	import TagBadge from './TagBadge.svelte';

	interface Tag {
		_id: string;
		name: string;
		color?: string;
		type?: string;
	}

	interface Props {
		tags: Tag[];
		/** Set of currently selected tag IDs. Empty means "all". */
		selectedTagIds: Set<string>;
		/** Called when a tag is toggled. */
		ontoggle?: (tagId: string) => void;
		/** Called to clear all tag filters. */
		onclear?: () => void;
	}

	let { tags, selectedTagIds, ontoggle, onclear }: Props = $props();
</script>

{#if tags.length > 0}
	<div class="flex flex-wrap items-center gap-1.5">
		<button
			type="button"
			class="cursor-pointer border px-1.5 py-0.5 font-mono text-xs transition-colors"
			class:border-primary={selectedTagIds.size === 0}
			class:text-primary={selectedTagIds.size === 0}
			class:border-border={selectedTagIds.size > 0}
			class:text-fg-muted={selectedTagIds.size > 0}
			onclick={() => onclear?.()}
		>
			<span class="opacity-50">0</span>
			all
		</button>
		{#each tags as tag, i (tag._id)}
			<TagBadge
				name={tag.name}
				color={tag.color}
				type={tag.type}
				active={selectedTagIds.has(tag._id)}
				index={i + 1}
				onclick={() => ontoggle?.(tag._id)}
			/>
		{/each}
	</div>
{/if}
