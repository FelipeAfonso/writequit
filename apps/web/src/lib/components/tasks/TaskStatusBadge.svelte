<script lang="ts">
	interface Props {
		status: 'inbox' | 'active' | 'done';
	}

	let { status }: Props = $props();

	const STATUS_CONFIG: Record<
		string,
		{ label: string; color: string; icon: string }
	> = {
		inbox: {
			label: 'inbox',
			color: 'var(--color-fg-muted)',
			icon: '>'
		},
		active: {
			label: 'active',
			color: 'var(--color-blue)',
			icon: '*'
		},
		done: {
			label: 'done',
			color: 'var(--color-green)',
			icon: 'x'
		}
	};

	let config = $derived(STATUS_CONFIG[status]);
</script>

<span
	class="inline-flex items-center gap-1 font-mono text-xs"
	style="color: {config.color};"
>
	<span class="opacity-70">[{config.icon}]</span>
	{config.label}
</span>
