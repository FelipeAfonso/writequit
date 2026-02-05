<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import {
		getTimezoneList,
		isValidTimezone,
		detectTimezone
	} from '$lib/utils/datetime';

	const client = useConvexClient();

	// ── Data queries ───────────────────────────────────────────────
	const user = useQuery(api.users.currentUser, {});
	const userSettings = useQuery(api.users.getSettings, {});
	const hasPassword = useQuery(api.users.hasPasswordAccount, {});

	// ── Profile state ──────────────────────────────────────────────
	let editingName = $state(false);
	let nameValue = $state('');
	let nameSaving = $state(false);
	let nameError = $state('');

	function startEditName() {
		nameValue = user.data?.name ?? '';
		nameError = '';
		editingName = true;
	}

	async function saveName() {
		const trimmed = nameValue.trim();
		if (trimmed.length === 0) {
			nameError = 'name cannot be empty';
			return;
		}
		nameSaving = true;
		nameError = '';
		try {
			await client.mutation(api.users.updateName, { name: trimmed });
			editingName = false;
		} catch (err) {
			nameError = err instanceof Error ? err.message : 'failed to save';
		} finally {
			nameSaving = false;
		}
	}

	function cancelEditName() {
		editingName = false;
		nameError = '';
	}

	// ── Password state ─────────────────────────────────────────────
	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');
	let passwordSaving = $state(false);
	let passwordError = $state('');
	let passwordSuccess = $state('');

	const MIN_PASSWORD_LENGTH = 6;

	async function handleChangePassword() {
		passwordError = '';
		passwordSuccess = '';

		if (currentPassword.length < MIN_PASSWORD_LENGTH) {
			passwordError = `current password must be at least ${MIN_PASSWORD_LENGTH} characters`;
			return;
		}
		if (newPassword.length < MIN_PASSWORD_LENGTH) {
			passwordError = `new password must be at least ${MIN_PASSWORD_LENGTH} characters`;
			return;
		}
		if (newPassword !== confirmPassword) {
			passwordError = 'passwords do not match';
			return;
		}

		passwordSaving = true;
		try {
			await client.action(api.users.changePassword, {
				currentPassword,
				newPassword
			});
			passwordSuccess = 'password changed successfully';
			currentPassword = '';
			newPassword = '';
			confirmPassword = '';
		} catch (err) {
			passwordError =
				err instanceof Error ? err.message : 'failed to change password';
		} finally {
			passwordSaving = false;
		}
	}

	// ── Settings state ─────────────────────────────────────────────
	type StatusFilter = 'lastUsed' | 'all' | 'inbox' | 'active' | 'done';
	type TagFilter = 'lastUsed' | 'all';

	let settingsSaving = $state(false);

	async function updateSetting(
		patch: Record<string, boolean | string>
	): Promise<void> {
		settingsSaving = true;
		try {
			await client.mutation(api.users.updateSettings, patch);
		} catch (err) {
			console.error('Failed to save setting:', err);
		} finally {
			settingsSaving = false;
		}
	}

	async function toggleViMode() {
		if (!userSettings.data) return;
		await updateSetting({ viMode: !userSettings.data.viMode });
	}

	async function setStatusFilter(value: StatusFilter) {
		await updateSetting({ defaultStatusFilter: value });
	}

	async function setTagFilter(value: TagFilter) {
		await updateSetting({ defaultTagFilter: value });
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

	// ── Timezone state ──────────────────────────────────────────────
	const timezones = getTimezoneList();
	let tzInput = $state('');
	let tzError = $state('');

	// Sync the input with the server value once it loads
	$effect(() => {
		if (userSettings.data) {
			tzInput = userSettings.data.timezone ?? detectTimezone();
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

	<!-- ─── Profile section ─────────────────────────────────────── -->
	<section class="flex flex-col gap-4">
		<h2
			class="border-b border-border pb-2 font-mono text-sm font-bold text-fg-dark"
		>
			-- profile
		</h2>

		{#if user.isLoading}
			<p class="animate-pulse font-mono text-sm text-fg-muted">loading...</p>
		{:else if user.data}
			<!-- Email (read-only) -->
			<div class="flex flex-col gap-1">
				<span class="font-mono text-xs text-fg-muted">email</span>
				<div
					class="border border-border bg-surface-2 px-3 py-2 font-mono text-sm text-fg-muted"
				>
					{user.data.email ?? '—'}
				</div>
			</div>

			<!-- Name (editable) -->
			<div class="flex flex-col gap-1">
				<label for="user-name" class="font-mono text-xs text-fg-muted">
					name
				</label>
				{#if editingName}
					<div class="flex flex-col gap-2">
						<input
							id="user-name"
							type="text"
							bind:value={nameValue}
							class={inputClass}
							onkeydown={(e) => {
								if (e.key === 'Enter') saveName();
								if (e.key === 'Escape') cancelEditName();
							}}
						/>
						{#if nameError}
							<p class="font-mono text-xs text-red">{nameError}</p>
						{/if}
						<div class="flex gap-2">
							<button
								type="button"
								class="border border-green px-3 py-1 font-mono text-xs text-green transition-colors hover:bg-green hover:text-bg-dark disabled:opacity-50"
								onclick={saveName}
								disabled={nameSaving}
							>
								{nameSaving ? 'saving...' : ':w save'}
							</button>
							<button
								type="button"
								class="border border-border px-3 py-1 font-mono text-xs text-fg-muted transition-colors hover:border-border-highlight hover:text-fg-dark"
								onclick={cancelEditName}
							>
								:q cancel
							</button>
						</div>
					</div>
				{:else}
					<div class="flex items-center gap-3">
						<div
							class="flex-1 border border-border bg-surface-1 px-3 py-2 font-mono text-sm text-fg"
						>
							{user.data.name ?? '—'}
						</div>
						<button
							type="button"
							class="border border-border px-3 py-1 font-mono text-xs text-fg-muted transition-colors hover:border-primary hover:text-primary"
							onclick={startEditName}
						>
							:e edit
						</button>
					</div>
				{/if}
			</div>
		{/if}
	</section>

	<!-- ─── Password section ────────────────────────────────────── -->
	{#if hasPassword.data}
		<section class="flex flex-col gap-4">
			<h2
				class="border-b border-border pb-2 font-mono text-sm font-bold text-fg-dark"
			>
				-- password
			</h2>

			<form
				class="flex flex-col gap-3"
				onsubmit={(e) => {
					e.preventDefault();
					handleChangePassword();
				}}
			>
				<div class="flex flex-col gap-1">
					<label for="current-password" class="font-mono text-xs text-fg-muted">
						current password
					</label>
					<input
						id="current-password"
						type="password"
						bind:value={currentPassword}
						class={inputClass}
						placeholder="********"
						autocomplete="current-password"
					/>
				</div>

				<div class="flex flex-col gap-1">
					<label for="new-password" class="font-mono text-xs text-fg-muted">
						new password
						<span class="text-fg-gutter">
							(min {MIN_PASSWORD_LENGTH} chars)
						</span>
					</label>
					<input
						id="new-password"
						type="password"
						bind:value={newPassword}
						class={inputClass}
						placeholder="********"
						autocomplete="new-password"
					/>
				</div>

				<div class="flex flex-col gap-1">
					<label
						for="confirm-new-password"
						class="font-mono text-xs text-fg-muted"
					>
						confirm new password
					</label>
					<input
						id="confirm-new-password"
						type="password"
						bind:value={confirmPassword}
						class={inputClass}
						placeholder="********"
						autocomplete="new-password"
					/>
				</div>

				{#if passwordError}
					<p class="font-mono text-xs text-red">{passwordError}</p>
				{/if}
				{#if passwordSuccess}
					<p class="font-mono text-xs text-green">{passwordSuccess}</p>
				{/if}

				<button
					type="submit"
					disabled={passwordSaving}
					class="border border-primary px-4 py-2 font-mono text-sm text-primary transition-colors hover:bg-primary hover:text-bg-dark disabled:opacity-50"
				>
					{passwordSaving ? 'changing...' : ':passwd change password'}
				</button>
			</form>
		</section>
	{/if}

	<!-- ─── Settings section ────────────────────────────────────── -->
	<section class="flex flex-col gap-5">
		<h2
			class="border-b border-border pb-2 font-mono text-sm font-bold text-fg-dark"
		>
			-- settings
		</h2>

		{#if userSettings.isLoading}
			<p class="animate-pulse font-mono text-sm text-fg-muted">loading...</p>
		{:else if userSettings.data}
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
						class="shrink-0 border border-border px-3 py-2 font-mono text-xs text-fg-muted transition-colors hover:border-primary hover:text-primary"
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
					class="border px-3 py-1.5 font-mono text-xs transition-colors"
					class:border-green={userSettings.data.viMode}
					class:text-green={userSettings.data.viMode}
					class:bg-surface-2={userSettings.data.viMode}
					class:border-border={!userSettings.data.viMode}
					class:text-fg-muted={!userSettings.data.viMode}
					onclick={toggleViMode}
				>
					[{userSettings.data.viMode ? 'x' : ' '}] vi
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
							class="border px-2 py-1 font-mono text-xs transition-colors"
							class:border-primary={userSettings.data.defaultStatusFilter ===
								opt.value}
							class:text-primary={userSettings.data.defaultStatusFilter ===
								opt.value}
							class:bg-surface-2={userSettings.data.defaultStatusFilter ===
								opt.value}
							class:border-border={userSettings.data.defaultStatusFilter !==
								opt.value}
							class:text-fg-muted={userSettings.data.defaultStatusFilter !==
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
							class="border px-2 py-1 font-mono text-xs transition-colors"
							class:border-primary={userSettings.data.defaultTagFilter ===
								opt.value}
							class:text-primary={userSettings.data.defaultTagFilter ===
								opt.value}
							class:bg-surface-2={userSettings.data.defaultTagFilter ===
								opt.value}
							class:border-border={userSettings.data.defaultTagFilter !==
								opt.value}
							class:text-fg-muted={userSettings.data.defaultTagFilter !==
								opt.value}
							onclick={() => setTagFilter(opt.value)}
						>
							{opt.label}
						</button>
					{/each}
				</div>
			</div>
		{/if}
	</section>
</div>
