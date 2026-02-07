<script lang="ts">
	interface Props {
		/** Whether the dialog is open. */
		open: boolean;
		/** Message to display in the dialog. */
		message: string;
		/** Called when the user confirms (y key or click). */
		onconfirm: () => void;
		/** Called when the user cancels (n key, Escape, or click). */
		oncancel: () => void;
	}

	let { open, message, onconfirm, oncancel }: Props = $props();

	function handleKeydown(e: KeyboardEvent) {
		if (!open) return;

		if (e.key === 'y' || e.key === 'Y') {
			e.preventDefault();
			e.stopPropagation();
			onconfirm();
		} else if (e.key === 'n' || e.key === 'N' || e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			oncancel();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<!-- Backdrop -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
		onmousedown={oncancel}
	>
		<!-- Panel -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="border border-border bg-bg-dark p-6 font-mono shadow-lg"
			onmousedown={(e) => e.stopPropagation()}
		>
			<p class="mb-4 text-sm text-fg">{message}</p>
			<div class="flex items-center gap-4">
				<button
					type="button"
					class="border border-red px-3 py-1 text-xs text-red transition-colors hover:bg-red hover:text-bg-dark"
					onclick={onconfirm}
				>
					[y]es
				</button>
				<button
					type="button"
					class="border border-border px-3 py-1 text-xs text-fg-muted transition-colors hover:border-border-highlight hover:text-fg-dark"
					onclick={oncancel}
				>
					[n]o
				</button>
			</div>
		</div>
	</div>
{/if}
