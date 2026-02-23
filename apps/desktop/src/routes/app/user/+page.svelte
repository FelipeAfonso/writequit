<script lang="ts">
	import {
		getDataProvider,
		commandPalette,
		detectTimezone,
		isValidTimezone,
		getTimezoneList
	} from '@writequit/ui';
	import type { StatusFilter, TagFilter, AutoLinkMode } from '@writequit/ui';

	const provider = getDataProvider();

	// ── Data ───────────────────────────────────────────────────────
	const userSettings = provider.settings.get();

	// ── Settings state ─────────────────────────────────────────────
	let settingsSaving = $state(false);

	async function updateSetting(
		patch: Record<string, boolean | string | number | undefined>
	): Promise<void> {
		settingsSaving = true;
		try {
			await provider.settings.update(patch);
		} catch (err) {
			console.error('Failed to save setting:', err);
		} finally {
			settingsSaving = false;
		}
	}

	async function toggleViMode() {
		if (!userSettings.current) return;
		await updateSetting({ viMode: !userSettings.current.viMode });
	}

	async function setStatusFilter(value: StatusFilter) {
		await updateSetting({ defaultStatusFilter: value });
	}

	async function setTagFilter(value: TagFilter) {
		await updateSetting({ defaultTagFilter: value });
	}

	async function setAutoLinkMode(value: AutoLinkMode) {
		await updateSetting({ autoLinkMode: value });
	}

	const statusOptions: { value: StatusFilter; label: string }[] = [
		{ value: 'lastUsed', label: 'last used' },
		{ value: 'all', label: 'all' },
		{ value: 'inbox', label: 'inbox' },
		{ value: 'active', label: 'active' },
		{ value: 'done', label: 'done' }
	];

	const tagOptions: { value: TagFilter; label: string }[] = [
		{ value: 'lastUsed', label: 'last used' },
		{ value: 'all', label: 'all' }
	];

	const autoLinkOptions: {
		value: AutoLinkMode;
		label: string;
		desc: string;
	}[] = [
		{
			value: 'all',
			label: 'all active',
			desc: 'link all active tasks, ignore tags'
		},
		{
			value: 'scoped',
			label: 'tag-scoped',
			desc: 'link tasks sharing session tags'
		},
		{
			value: 'startOnly',
			label: 'start only',
			desc: 'link at timer start, not on status changes'
		},
		{ value: 'off', label: 'off', desc: 'never auto-link' }
	];

	// ── Timezone state ──────────────────────────────────────────────
	const timezones = getTimezoneList();
	let tzInput = $state('');
	let tzError = $state('');

	// Sync the input with the stored value once it loads
	$effect(() => {
		if (userSettings.current) {
			tzInput = userSettings.current.timezone ?? detectTimezone();
		}
	});

	async function saveTimezone() {
		const trimmed = tzInput.trim();
		if (!isValidTimezone(trimmed)) {
			tzError = 'invalid timezone';
			return;
		}
		tzError = '';
		await updateSetting({ timezone: trimmed });
	}

	const inputClass =
		'border border-border bg-surface-1 px-3 py-2 font-mono text-sm text-fg placeholder:text-fg-muted focus:border-primary focus:ring-0 w-full';
</script>

<svelte:head>
	<title>user | :wq</title>
</svelte:head>

<div class="mx-auto flex max-w-2xl flex-col gap-8 p-6">
	<!-- Page header -->
	<div class="flex items-baseline gap-3">
		<h1 class="font-mono text-lg font-bold text-fg">
			<span class="text-fg-muted">@</span>
			user
		</h1>
		{#if settingsSaving}
			<span class="animate-pulse font-mono text-xs text-fg-muted">
				saving...
			</span>
		{/if}
	</div>

	<!-- ─── Profile section (desktop — local only) ─────────────── -->
	<section class="flex flex-col gap-4">
		<h2
			class="border-b border-border pb-2 font-mono text-sm font-bold text-fg-dark"
		>
			-- profile
		</h2>
		<div class="flex flex-col gap-1">
			<span class="font-mono text-xs text-fg-muted">mode</span>
			<div
				class="border border-border bg-surface-2 px-3 py-2 font-mono text-sm text-fg-muted"
			>
				local (desktop)
			</div>
		</div>
		<p class="font-mono text-xs text-fg-muted">
			Data is stored locally at ~/.local/share/writequit/ and
			~/.config/writequit/
		</p>
	</section>

	<!-- ─── Settings section ────────────────────────────────────── -->
	<section class="flex flex-col gap-5">
		<h2
			class="border-b border-border pb-2 font-mono text-sm font-bold text-fg-dark"
		>
			-- settings
		</h2>

		{#if userSettings.isLoading}
			<p class="animate-pulse font-mono text-sm text-fg-muted">loading...</p>
		{:else if userSettings.current}
			<!-- Timezone -->
			<div class="flex flex-col gap-2">
				<div class="flex flex-col gap-0.5">
					<span class="font-mono text-sm text-fg-dark">timezone</span>
					<span class="font-mono text-xs text-fg-muted">
						all dates and times are displayed in this timezone
					</span>
				</div>
				<div class="flex items-center gap-2">
					<input
						type="text"
						bind:value={tzInput}
						list="tz-list"
						class={inputClass}
						placeholder="America/New_York"
						onkeydown={(e) => {
							if (e.key === 'Enter') saveTimezone();
						}}
						onchange={saveTimezone}
					/>
					<button
						type="button"
						class="shrink-0 cursor-pointer border border-border px-3 py-2 font-mono text-xs text-fg-muted transition-colors hover:border-primary hover:text-primary"
						onclick={saveTimezone}
					>
						:w
					</button>
				</div>
				{#if tzError}
					<p class="font-mono text-xs text-red">{tzError}</p>
				{/if}
				<datalist id="tz-list">
					{#each timezones as tz (tz)}
						<option value={tz}></option>
					{/each}
				</datalist>
			</div>

			<!-- Vi mode toggle -->
			<div class="flex items-center justify-between">
				<div class="flex flex-col gap-0.5">
					<span class="font-mono text-sm text-fg-dark">vi mode</span>
					<span class="font-mono text-xs text-fg-muted">
						use vim keybindings in the task editor
					</span>
				</div>
				<button
					type="button"
					class="cursor-pointer border px-3 py-1.5 font-mono text-xs transition-colors"
					class:border-green={userSettings.current.viMode}
					class:text-green={userSettings.current.viMode}
					class:bg-surface-2={userSettings.current.viMode}
					class:border-border={!userSettings.current.viMode}
					class:text-fg-muted={!userSettings.current.viMode}
					onclick={toggleViMode}
				>
					[{userSettings.current.viMode ? 'x' : ' '}] vi
				</button>
			</div>

			<!-- Default status filter -->
			<div class="flex flex-col gap-2">
				<div class="flex flex-col gap-0.5">
					<span class="font-mono text-sm text-fg-dark">
						default status filter
					</span>
					<span class="font-mono text-xs text-fg-muted">
						which status to show when opening the tasks page
					</span>
				</div>
				<div class="flex flex-wrap gap-1.5">
					{#each statusOptions as opt (opt.value)}
						<button
							type="button"
							class="cursor-pointer border px-2 py-1 font-mono text-xs transition-colors"
							class:border-primary={userSettings.current.defaultStatusFilter ===
								opt.value}
							class:text-primary={userSettings.current.defaultStatusFilter ===
								opt.value}
							class:bg-surface-2={userSettings.current.defaultStatusFilter ===
								opt.value}
							class:border-border={userSettings.current.defaultStatusFilter !==
								opt.value}
							class:text-fg-muted={userSettings.current.defaultStatusFilter !==
								opt.value}
							onclick={() => setStatusFilter(opt.value)}
						>
							{opt.label}
						</button>
					{/each}
				</div>
			</div>

			<!-- Default tag filter -->
			<div class="flex flex-col gap-2">
				<div class="flex flex-col gap-0.5">
					<span class="font-mono text-sm text-fg-dark">default tag filter</span>
					<span class="font-mono text-xs text-fg-muted">
						which tags to show when opening the tasks page
					</span>
				</div>
				<div class="flex flex-wrap gap-1.5">
					{#each tagOptions as opt (opt.value)}
						<button
							type="button"
							class="cursor-pointer border px-2 py-1 font-mono text-xs transition-colors"
							class:border-primary={userSettings.current.defaultTagFilter ===
								opt.value}
							class:text-primary={userSettings.current.defaultTagFilter ===
								opt.value}
							class:bg-surface-2={userSettings.current.defaultTagFilter ===
								opt.value}
							class:border-border={userSettings.current.defaultTagFilter !==
								opt.value}
							class:text-fg-muted={userSettings.current.defaultTagFilter !==
								opt.value}
							onclick={() => setTagFilter(opt.value)}
						>
							{opt.label}
						</button>
					{/each}
				</div>
			</div>

			<!-- Auto-link sessions -->
			<div class="flex flex-col gap-2">
				<div class="flex flex-col gap-0.5">
					<span class="font-mono text-sm text-fg-dark">auto-link sessions</span>
					<span class="font-mono text-xs text-fg-muted">
						how tasks are automatically linked to time sessions
					</span>
				</div>
				<div class="flex flex-wrap gap-1.5">
					{#each autoLinkOptions as opt (opt.value)}
						<button
							type="button"
							class="cursor-pointer border px-2 py-1 font-mono text-xs transition-colors"
							class:border-primary={userSettings.current.autoLinkMode ===
								opt.value}
							class:text-primary={userSettings.current.autoLinkMode ===
								opt.value}
							class:bg-surface-2={userSettings.current.autoLinkMode ===
								opt.value}
							class:border-border={userSettings.current.autoLinkMode !==
								opt.value}
							class:text-fg-muted={userSettings.current.autoLinkMode !==
								opt.value}
							onclick={() => setAutoLinkMode(opt.value)}
							title={opt.desc}
						>
							{opt.label}
						</button>
					{/each}
				</div>
				<span class="font-mono text-xs text-fg-muted">
					{autoLinkOptions.find(
						(o) => o.value === userSettings.current?.autoLinkMode
					)?.desc ?? ''}
				</span>
			</div>
		{/if}
	</section>

	<!-- ─── Tutorial section ─────────────────────────────────────── -->
	<section class="flex flex-col gap-4">
		<h2
			class="border-b border-border pb-2 font-mono text-sm font-bold text-fg-dark"
		>
			-- tutorial
		</h2>

		<div class="flex items-center justify-between">
			<div class="flex flex-col gap-0.5">
				<span class="font-mono text-sm text-fg-dark">onboarding</span>
				<span class="font-mono text-xs text-fg-muted">
					replay the getting started walkthrough
				</span>
			</div>
			<button
				type="button"
				class="cursor-pointer border border-border px-3 py-1.5 font-mono text-xs text-fg-muted transition-colors hover:border-primary hover:text-primary"
				onclick={() => commandPalette.context.showTutorial?.()}
			>
				:tutorial
			</button>
		</div>
	</section>
</div>
