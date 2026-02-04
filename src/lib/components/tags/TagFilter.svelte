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
		/** Currently selected tag ID, or null for "all". */
		selectedTagId: string | null;
		/** Called when a tag filter is toggled. Null means "show all". */
		onselect?: (tagId: string | null) => void;
	}

	let { tags, selectedTagId, onselect }: Props = $props();

	function handleSelect(tagId: string | null) {
		// Toggle: clicking the same tag again deselects it
		if (tagId === selectedTagId) {
			onselect?.(null);
		} else {
			onselect?.(tagId);
		}
	}
</script>

{#if tags.length > 0}
	<div class="flex flex-wrap items-center gap-1.5">
		<button
			type="button"
			class="border px-1.5 py-0.5 font-mono text-xs transition-colors"
			class:border-primary={selectedTagId === null}
			class:text-primary={selectedTagId === null}
			class:border-border={selectedTagId !== null}
			class:text-fg-muted={selectedTagId !== null}
			onclick={() => handleSelect(null)}
		>
			all
		</button>
		{#each tags as tag (tag._id)}
			<TagBadge
				name={tag.name}
				color={tag.color}
				type={tag.type}
				active={selectedTagId === tag._id}
				onclick={() => handleSelect(tag._id)}
			/>
		{/each}
	</div>
{/if}
