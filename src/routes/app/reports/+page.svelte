<script lang="ts">
	import { getContext } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import TagBadge from '$lib/components/tags/TagBadge.svelte';
	import {
		formatDate,
		formatTime,
		formatDuration,
		formatDateHeader,
		getLocalMidnight,
		getDateRangeBounds,
		TIMEZONE_CTX,
		type TimezoneGetter
	} from '$lib/utils/datetime';
	import {
		downloadReportPdf,
		type ReportDayGroup,
		type ReportData
	} from '$lib/utils/reportPdf';
	import {
		downloadInvoicePdf,
		type InvoiceData,
		type InvoiceLineItem,
		type InvoiceTheme
	} from '$lib/utils/invoicePdf';

	let { data } = $props();

	const getTz = getContext<TimezoneGetter>(TIMEZONE_CTX);
	let timezone = $derived(getTz());
	const client = useConvexClient();

	// ── Tab state ─────────────────────────────────────────────────
	let activeTab = $state<'sessions' | 'invoices'>('sessions');
	let reportTheme = $state<InvoiceTheme>('dark');

	// ── Date range state ───────────────────────────────────────────
	let dateFrom = $state('');
	let dateTo = $state('');

	// Initialize to this week
	$effect(() => {
		if (!dateFrom && timezone) {
			const bounds = getDateRangeBounds('week', timezone);
			dateFrom = formatDate(bounds.startAfter, timezone);
			dateTo = formatDate(Date.now(), timezone);
		}
	});

	// Convert date strings to UTC ms for the query
	let queryArgs = $derived.by(() => {
		if (!dateFrom || !dateTo || !timezone) return undefined;

		const startMs = getLocalMidnight(
			new Date(dateFrom + 'T12:00:00Z').getTime(),
			timezone
		);
		// End of the "to" day = midnight of next day
		const endMs =
			getLocalMidnight(new Date(dateTo + 'T12:00:00Z').getTime(), timezone) +
			86_400_000;

		return { startAfter: startMs, startBefore: endMs };
	});

	const sessions = useQuery(api.sessions.listWithTasks, () => queryArgs ?? {});
	const user = useQuery(api.users.currentUser, {}, () => ({
		initialData: data.preloaded?.user
	}));
	const userSettings = useQuery(api.users.getSettings, {}, () => ({
		initialData: data.preloaded?.settings
	}));
	const invoices = useQuery(api.invoices.list, {}, () => ({
		initialData: data.preloaded?.invoices
	}));
	const nextNumber = useQuery(api.invoices.getNextNumber, {}, () => ({
		initialData: data.preloaded?.nextInvoiceNumber
	}));

	// ── Quick presets ──────────────────────────────────────────────
	function setPreset(
		preset: 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth'
	) {
		const now = Date.now();
		if (preset === 'thisWeek') {
			const bounds = getDateRangeBounds('week', timezone);
			dateFrom = formatDate(bounds.startAfter, timezone);
			dateTo = formatDate(now, timezone);
		} else if (preset === 'lastWeek') {
			const bounds = getDateRangeBounds('week', timezone);
			const lastWeekEnd = bounds.startAfter - 1;
			const lastWeekStart = bounds.startAfter - 7 * 86_400_000;
			dateFrom = formatDate(lastWeekStart, timezone);
			dateTo = formatDate(lastWeekEnd, timezone);
		} else if (preset === 'thisMonth') {
			const bounds = getDateRangeBounds('month', timezone);
			dateFrom = formatDate(bounds.startAfter, timezone);
			dateTo = formatDate(now, timezone);
		} else if (preset === 'lastMonth') {
			const bounds = getDateRangeBounds('month', timezone);
			const lastMonthEnd = bounds.startAfter - 1;
			// Go to start of previous month (use UTC to avoid mutation)
			const tmp = new Date(lastMonthEnd);
			const prevStart = getLocalMidnight(
				Date.UTC(tmp.getUTCFullYear(), tmp.getUTCMonth(), 1),
				timezone
			);
			dateFrom = formatDate(prevStart, timezone);
			dateTo = formatDate(lastMonthEnd, timezone);
		}
	}

	// ── Computed session data ──────────────────────────────────────

	interface SessionData {
		_id: string;
		startTime: number;
		endTime?: number;
		description?: string;
		tagIds: string[];
		taskIds: string[];
		tags: { _id: string; name: string; color?: string; type?: string }[];
		tasks: { _id: string; title: string; status: string }[];
	}

	let sessionList = $derived((sessions.data ?? []) as SessionData[]);

	// Group by day for display
	interface DayGroup {
		date: string;
		label: string;
		totalMs: number;
		sessions: SessionData[];
	}

	let grouped = $derived.by(() => {
		const groups = new SvelteMap<string, DayGroup>();

		for (const session of sessionList) {
			const { date, label } = formatDateHeader(session.startTime, timezone);

			if (!groups.has(date)) {
				groups.set(date, { date, label, totalMs: 0, sessions: [] });
			}

			const group = groups.get(date)!;
			group.sessions.push(session);

			if (session.endTime) {
				group.totalMs += session.endTime - session.startTime;
			}
		}

		return [...groups.values()].sort((a, b) => b.date.localeCompare(a.date));
	});

	let totalMs = $derived(grouped.reduce((acc, g) => acc + g.totalMs, 0));
	let totalSessions = $derived(sessionList.length);

	// ── Report generation ──────────────────────────────────────────

	function handleGenerateReport() {
		if (sessionList.length === 0) return;

		const reportGroups: ReportDayGroup[] = grouped.map((g) => ({
			date: g.date,
			label: g.label,
			totalMs: g.totalMs,
			sessions: g.sessions.map((s) => ({
				startTime: s.startTime,
				endTime: s.endTime,
				description: s.description,
				tags: s.tags.map((t) => ({
					name: t.name,
					color: t.color,
					type: t.type
				})),
				tasks: s.tasks.map((t) => ({ title: t.title, status: t.status }))
			}))
		}));

		const data: ReportData = {
			userName: user.data?.name ?? user.data?.email ?? 'Unknown',
			startDate: dateFrom,
			endDate: dateTo,
			timezone,
			groups: reportGroups,
			totalMs,
			totalSessions,
			theme: reportTheme
		};

		downloadReportPdf(data);
	}

	// ── Invoice creation ───────────────────────────────────────────

	let showInvoiceForm = $state(false);
	let invoiceSaving = $state(false);
	let invoiceError = $state('');
	let invoiceSuccess = $state('');

	// Form state (pre-filled from user + settings)
	let invNumber = $state('');
	let invNumberPrefilled = $state(false);
	let invFromName = $state('');
	let invFromEmail = $state('');
	let invFromAddress = $state('');
	let invClientName = $state('');
	let invClientAddress = $state('');
	let invHourlyRate = $state(0);
	let invCurrency = $state('USD');
	let invPaymentTerms = $state('');
	let invDueDate = $state('');
	let invNotes = $state('');
	let invTheme = $state<InvoiceTheme>('dark');

	// Custom (non-session) line items
	interface CustomLineItem {
		label: string;
		quantity: number;
		unitPrice: number;
	}
	let customLineItems = $state<CustomLineItem[]>([]);

	function addCustomLineItem() {
		customLineItems.push({ label: '', quantity: 1, unitPrice: 0 });
	}

	function removeCustomLineItem(index: number) {
		customLineItems.splice(index, 1);
	}

	// Pre-fill invoice number from next suggested (once)
	$effect(() => {
		if (nextNumber.data && !invNumberPrefilled) {
			invNumber = nextNumber.data;
			invNumberPrefilled = true;
		}
	});

	// Pre-fill from user data + settings
	$effect(() => {
		if (user.data && !invFromName) {
			invFromName = user.data.name ?? '';
			invFromEmail = user.data.email ?? '';
		}
	});

	$effect(() => {
		if (userSettings.data) {
			if (!invFromAddress && userSettings.data.invoiceFromAddress) {
				invFromAddress = userSettings.data.invoiceFromAddress;
			}
			if (!invHourlyRate && userSettings.data.defaultHourlyRate) {
				invHourlyRate = userSettings.data.defaultHourlyRate;
			}
			if (invCurrency === 'USD' && userSettings.data.defaultCurrency) {
				invCurrency = userSettings.data.defaultCurrency;
			}
			if (!invPaymentTerms && userSettings.data.defaultPaymentTerms) {
				invPaymentTerms = userSettings.data.defaultPaymentTerms;
			}
			if (userSettings.data.defaultInvoiceTheme) {
				invTheme = userSettings.data.defaultInvoiceTheme;
			}
		}
	});

	// Compute line items grouped by project tag
	let computedLineItems = $derived.by(() => {
		if (invHourlyRate <= 0) return [];

		const projectHours = new SvelteMap<string, number>();

		for (const session of sessionList) {
			if (!session.endTime) continue;
			const hours = (session.endTime - session.startTime) / 3_600_000;

			const projectTag = session.tags.find((t) => t.type === 'project');
			const label = projectTag ? projectTag.name : 'Other';

			projectHours.set(label, (projectHours.get(label) ?? 0) + hours);
		}

		const items: InvoiceLineItem[] = [];
		for (const [label, hours] of projectHours) {
			items.push({
				label,
				hours: Math.round(hours * 100) / 100,
				amount: Math.round(hours * invHourlyRate * 100) / 100
			});
		}

		// Sort: named projects first, "Other" last
		items.sort((a, b) => {
			if (a.label === 'Other') return 1;
			if (b.label === 'Other') return -1;
			return a.label.localeCompare(b.label);
		});

		return items;
	});

	// Merge session + custom items for submission
	let allLineItems = $derived.by(() => {
		const items: InvoiceLineItem[] = computedLineItems.map((item) => ({
			label: item.label,
			hours: item.hours,
			amount: item.amount
		}));

		for (const ci of customLineItems) {
			if (!ci.label.trim() || ci.unitPrice <= 0) continue;
			const qty = ci.quantity || 1;
			items.push({
				label: ci.label.trim(),
				quantity: qty,
				unitPrice: ci.unitPrice,
				amount: Math.round(qty * ci.unitPrice * 100) / 100
			});
		}

		return items;
	});

	let invoiceSubtotal = $derived(
		allLineItems.reduce((acc, item) => acc + item.amount, 0)
	);

	async function handleCreateInvoice() {
		invoiceError = '';
		invoiceSuccess = '';

		if (!invFromName.trim()) {
			invoiceError = 'your name is required';
			return;
		}
		if (!invClientName.trim()) {
			invoiceError = 'client name is required';
			return;
		}
		if (allLineItems.length === 0) {
			invoiceError = 'no line items – add sessions or custom items';
			return;
		}
		if (!queryArgs) {
			invoiceError = 'invalid date range';
			return;
		}

		invoiceSaving = true;

		try {
			// Save invoice defaults to settings for next time
			await client.mutation(api.users.updateSettings, {
				invoiceFromAddress: invFromAddress || undefined,
				defaultHourlyRate: invHourlyRate,
				defaultCurrency: invCurrency,
				defaultPaymentTerms: invPaymentTerms || undefined,
				defaultInvoiceTheme: invTheme
			});

			// Create invoice (with user-provided or auto-generated number)
			const invoiceId = await client.mutation(api.invoices.create, {
				invoiceNumber: invNumber.trim() || undefined,
				startDate: queryArgs.startAfter,
				endDate: queryArgs.startBefore,
				fromName: invFromName.trim(),
				fromEmail: invFromEmail.trim(),
				fromAddress: invFromAddress.trim() || undefined,
				clientName: invClientName.trim(),
				clientAddress: invClientAddress.trim() || undefined,
				hourlyRate: invHourlyRate,
				currency: invCurrency,
				lineItems: allLineItems,
				subtotal: invoiceSubtotal,
				total: invoiceSubtotal,
				paymentTerms: invPaymentTerms.trim() || undefined,
				dueDate: invDueDate
					? getLocalMidnight(
							new Date(invDueDate + 'T12:00:00Z').getTime(),
							timezone
						)
					: undefined,
				notes: invNotes.trim() || undefined
			});

			// Fetch the created invoice to get the final number
			const created = await client.query(api.invoices.get, {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				id: invoiceId as any
			});

			if (created) {
				// Generate and download PDF
				const pdfData: InvoiceData = {
					invoiceNumber: created.invoiceNumber,
					createdAt: formatDate(created.createdAt, timezone),
					startDate: dateFrom,
					endDate: dateTo,
					fromName: created.fromName,
					fromEmail: created.fromEmail,
					fromAddress: created.fromAddress,
					clientName: created.clientName,
					clientAddress: created.clientAddress,
					hourlyRate: created.hourlyRate,
					currency: created.currency,
					lineItems: created.lineItems,
					subtotal: created.subtotal,
					total: created.total,
					paymentTerms: created.paymentTerms,
					dueDate: created.dueDate
						? formatDate(created.dueDate, timezone)
						: undefined,
					notes: created.notes,
					theme: invTheme
				};

				downloadInvoicePdf(pdfData);
			}

			invoiceSuccess = `invoice created: ${created?.invoiceNumber ?? 'success'}`;
			showInvoiceForm = false;

			// Reset form state for next time
			invNumber = '';
			invNumberPrefilled = false;
			customLineItems = [];
		} catch (err) {
			invoiceError =
				err instanceof Error ? err.message : 'failed to create invoice';
		} finally {
			invoiceSaving = false;
		}
	}

	// ── Re-download invoice PDF ────────────────────────────────────

	interface InvoiceRecord {
		_id: string;
		invoiceNumber: string;
		status: string;
		startDate: number;
		endDate: number;
		fromName: string;
		fromEmail: string;
		fromAddress?: string;
		clientName: string;
		clientAddress?: string;
		hourlyRate: number;
		currency: string;
		lineItems: {
			label: string;
			hours?: number;
			quantity?: number;
			unitPrice?: number;
			amount: number;
		}[];
		subtotal: number;
		total: number;
		paymentTerms?: string;
		dueDate?: number;
		notes?: string;
		createdAt: number;
	}

	function redownloadInvoice(inv: InvoiceRecord, theme: InvoiceTheme) {
		const pdfData: InvoiceData = {
			invoiceNumber: inv.invoiceNumber,
			createdAt: formatDate(inv.createdAt, timezone),
			startDate: formatDate(inv.startDate, timezone),
			endDate: formatDate(inv.endDate, timezone),
			fromName: inv.fromName,
			fromEmail: inv.fromEmail,
			fromAddress: inv.fromAddress,
			clientName: inv.clientName,
			clientAddress: inv.clientAddress,
			hourlyRate: inv.hourlyRate,
			currency: inv.currency,
			lineItems: inv.lineItems,
			subtotal: inv.subtotal,
			total: inv.total,
			paymentTerms: inv.paymentTerms,
			dueDate: inv.dueDate ? formatDate(inv.dueDate, timezone) : undefined,
			notes: inv.notes,
			theme
		};
		downloadInvoicePdf(pdfData);
	}

	// ── Follow-up invoice (pre-fill from existing) ────────────────

	function incrementInvoiceNumber(num: string): string {
		// Match trailing digits, e.g. "INV-003" -> prefix="INV-", digits="003"
		const match = num.match(/^(.*?)(\d+)$/);
		if (!match) return num + '-2';
		const [, prefix, digits] = match;
		const next = String(parseInt(digits, 10) + 1).padStart(digits.length, '0');
		return prefix + next;
	}

	function prefillFromInvoice(inv: InvoiceRecord) {
		invNumber = incrementInvoiceNumber(inv.invoiceNumber);
		invNumberPrefilled = true;
		invFromName = inv.fromName;
		invFromEmail = inv.fromEmail;
		invFromAddress = inv.fromAddress ?? '';
		invClientName = inv.clientName;
		invClientAddress = inv.clientAddress ?? '';
		invHourlyRate = inv.hourlyRate;
		invCurrency = inv.currency;
		invPaymentTerms = inv.paymentTerms ?? '';
		invNotes = inv.notes ?? '';

		showInvoiceForm = true;
		invoiceError = '';
		invoiceSuccess = '';
	}

	// ── Per-invoice download theme state ───────────────────────────

	let invoiceDownloadThemes = new SvelteMap<string, InvoiceTheme>();

	function getDownloadTheme(id: string): InvoiceTheme {
		return invoiceDownloadThemes.get(id) ?? invTheme;
	}

	// ── Invoice status cycling ─────────────────────────────────────

	const STATUS_CYCLE: Record<string, 'draft' | 'sent' | 'paid'> = {
		draft: 'sent',
		sent: 'paid',
		paid: 'draft'
	};

	async function cycleInvoiceStatus(inv: InvoiceRecord) {
		const next = STATUS_CYCLE[inv.status] ?? 'draft';
		await client.mutation(api.invoices.updateStatus, {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			id: inv._id as any,
			status: next
		});
	}

	// ── Currency options ───────────────────────────────────────────
	const currencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'BRL', 'JPY'];

	const inputClass =
		'border border-border bg-surface-1 px-3 py-2 font-mono text-sm text-fg placeholder:text-fg-muted focus:border-primary focus:ring-0 w-full';
</script>

<svelte:head>
	<title>reports | :wq</title>
</svelte:head>

<div class="mx-auto flex max-w-3xl flex-col gap-6 p-6">
	<!-- Page header -->
	<div class="flex items-baseline gap-3">
		<h1 class="font-mono text-lg font-bold text-fg">
			<span class="text-fg-muted">$</span>
			reports
		</h1>
		{#if totalSessions > 0}
			<span class="font-mono text-xs text-fg-muted">
				{totalSessions} session{totalSessions !== 1 ? 's' : ''}
				&middot; {formatDuration(totalMs)} total
			</span>
		{/if}
	</div>

	<!-- ─── Date range configuration ────────────────────────────── -->
	<section class="flex flex-col gap-3">
		<h2
			class="border-b border-border pb-2 font-mono text-sm font-bold text-fg-dark"
		>
			-- date range
		</h2>

		<!-- Date inputs -->
		<div class="flex items-center gap-2">
			<div class="flex flex-col gap-1">
				<label for="date-from" class="font-mono text-xs text-fg-muted">
					from
				</label>
				<input
					id="date-from"
					type="date"
					bind:value={dateFrom}
					class={inputClass}
				/>
			</div>
			<span class="mt-5 font-mono text-fg-muted">--</span>
			<div class="flex flex-col gap-1">
				<label for="date-to" class="font-mono text-xs text-fg-muted">to</label>
				<input
					id="date-to"
					type="date"
					bind:value={dateTo}
					class={inputClass}
				/>
			</div>
		</div>

		<!-- Quick presets -->
		<div class="flex flex-wrap items-center gap-1.5">
			<span class="font-mono text-xs text-fg-muted">presets:</span>
			{#each [{ key: 'thisWeek', label: 'this week' }, { key: 'lastWeek', label: 'last week' }, { key: 'thisMonth', label: 'this month' }, { key: 'lastMonth', label: 'last month' }] as preset (preset.key)}
				<button
					type="button"
					class="cursor-pointer border border-border px-2 py-1 font-mono text-xs text-fg-muted transition-colors hover:border-primary hover:text-primary"
					onclick={() =>
						setPreset(
							preset.key as 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth'
						)}
				>
					{preset.label}
				</button>
			{/each}
		</div>
	</section>

	<!-- ─── Tab bar ─────────────────────────────────────────────── -->
	<div class="flex items-center gap-0 border-b border-border">
		<button
			type="button"
			class="cursor-pointer border-b-2 px-4 py-2 font-mono text-sm transition-colors"
			class:border-primary={activeTab === 'sessions'}
			class:text-primary={activeTab === 'sessions'}
			class:border-transparent={activeTab !== 'sessions'}
			class:text-fg-muted={activeTab !== 'sessions'}
			class:hover:text-fg={activeTab !== 'sessions'}
			onclick={() => (activeTab = 'sessions')}
		>
			sessions
			{#if totalSessions > 0}
				<span
					class="ml-1 text-xs"
					class:text-primary={activeTab === 'sessions'}
					class:text-fg-muted={activeTab !== 'sessions'}
				>
					({totalSessions})
				</span>
			{/if}
		</button>
		<button
			type="button"
			class="cursor-pointer border-b-2 px-4 py-2 font-mono text-sm transition-colors"
			class:border-primary={activeTab === 'invoices'}
			class:text-primary={activeTab === 'invoices'}
			class:border-transparent={activeTab !== 'invoices'}
			class:text-fg-muted={activeTab !== 'invoices'}
			class:hover:text-fg={activeTab !== 'invoices'}
			onclick={() => (activeTab = 'invoices')}
		>
			invoices
			{#if invoices.data && invoices.data.length > 0}
				<span
					class="ml-1 text-xs"
					class:text-primary={activeTab === 'invoices'}
					class:text-fg-muted={activeTab !== 'invoices'}
				>
					({invoices.data.length})
				</span>
			{/if}
		</button>
	</div>

	<!-- ═══════════════════════════════════════════════════════════ -->
	<!-- SESSIONS TAB                                               -->
	<!-- ═══════════════════════════════════════════════════════════ -->
	{#if activeTab === 'sessions'}
		<!-- Session preview (grouped by day) -->
		<section class="flex flex-col gap-3">
			<div
				class="flex items-center justify-between border-b border-border pb-2"
			>
				<h2
					class="flex items-baseline gap-2 font-mono text-sm font-bold text-fg-dark"
				>
					-- sessions in range
					{#if totalSessions > 0}
						<span class="text-xs font-normal text-fg-muted">
							({totalSessions} &middot;
							<span class="text-green">{formatDuration(totalMs)}</span>
							)
						</span>
					{/if}
				</h2>
				<div class="flex items-center gap-2">
					<div class="flex items-center">
						<button
							type="button"
							class="relative cursor-pointer border px-2 py-1.5 font-mono text-xs transition-colors"
							class:z-10={reportTheme === 'dark'}
							class:border-primary={reportTheme === 'dark'}
							class:text-primary={reportTheme === 'dark'}
							class:bg-surface-2={reportTheme === 'dark'}
							class:border-border={reportTheme !== 'dark'}
							class:text-fg-muted={reportTheme !== 'dark'}
							onclick={() => (reportTheme = 'dark')}
						>
							dark
						</button>
						<button
							type="button"
							class="relative -ml-px cursor-pointer border px-2 py-1.5 font-mono text-xs transition-colors"
							class:z-10={reportTheme === 'light'}
							class:border-primary={reportTheme === 'light'}
							class:text-primary={reportTheme === 'light'}
							class:bg-surface-2={reportTheme === 'light'}
							class:border-border={reportTheme !== 'light'}
							class:text-fg-muted={reportTheme !== 'light'}
							onclick={() => (reportTheme = 'light')}
						>
							light
						</button>
					</div>
					<button
						type="button"
						class="cursor-copy border border-primary px-3 py-1.5 font-mono text-xs text-primary transition-colors hover:bg-primary hover:text-bg-dark disabled:cursor-not-allowed disabled:opacity-50"
						disabled={totalSessions === 0}
						onclick={handleGenerateReport}
					>
						:report
					</button>
				</div>
			</div>

			{#if sessions.isLoading}
				<div class="py-4 text-center font-mono text-sm text-fg-muted">
					loading...
				</div>
			{:else if grouped.length === 0}
				<div class="py-4 text-center font-mono text-sm text-fg-muted">
					no sessions in this date range
				</div>
			{:else}
				<div class="flex flex-col gap-3">
					{#each grouped as group (group.date)}
						<!-- Day header -->
						<div class="flex items-baseline justify-between">
							<h3 class="font-mono text-xs font-bold text-fg-muted">
								{group.label}
							</h3>
							<span class="font-mono text-xs text-green">
								{formatDuration(group.totalMs)}
							</span>
						</div>

						<!-- Sessions -->
						<div class="flex flex-col gap-1">
							{#each group.sessions as session (session._id)}
								<div
									class="flex flex-col gap-1 border border-border px-3 py-2 font-mono text-sm"
								>
									<div class="flex items-center gap-3">
										<!-- Time range -->
										<span class="shrink-0 text-fg-muted">
											{session.endTime
												? `${formatTime(session.startTime, timezone)}-${formatTime(session.endTime, timezone)}`
												: `${formatTime(session.startTime, timezone)}-...`}
										</span>

										<!-- Duration -->
										<span
											class="shrink-0 font-bold"
											class:text-green={!session.endTime}
											class:text-fg-dark={!!session.endTime}
										>
											{session.endTime
												? formatDuration(session.endTime - session.startTime)
												: 'running'}
										</span>

										<!-- Description -->
										{#if session.description}
											<span class="min-w-0 truncate text-fg">
												{session.description}
											</span>
										{/if}

										<!-- Tags -->
										{#if session.tags.length > 0}
											<div class="flex shrink-0 items-center gap-1">
												{#each session.tags as tag (tag._id)}
													<TagBadge
														name={tag.name}
														color={tag.color}
														type={tag.type}
													/>
												{/each}
											</div>
										{/if}
									</div>

									<!-- Linked tasks -->
									{#if session.tasks.length > 0}
										<div class="flex flex-col gap-0.5 pl-2">
											{#each session.tasks as task (task._id)}
												<span class="text-xs text-fg-muted">
													{task.status === 'done'
														? '[x]'
														: task.status === 'active'
															? '[*]'
															: '[>]'}
													{task.title}
												</span>
											{/each}
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{/each}
				</div>
			{/if}
		</section>
	{/if}

	<!-- ═══════════════════════════════════════════════════════════ -->
	<!-- INVOICES TAB                                               -->
	<!-- ═══════════════════════════════════════════════════════════ -->
	{#if activeTab === 'invoices'}
		<!-- Past invoices list -->
		<section class="flex flex-col gap-3">
			<div
				class="flex items-center justify-between border-b border-border pb-2"
			>
				<h2 class="font-mono text-sm font-bold text-fg-dark">-- invoices</h2>
				<button
					type="button"
					class="cursor-pointer border border-green px-3 py-1.5 font-mono text-xs text-green transition-colors hover:bg-green hover:text-bg-dark"
					onclick={() => {
						showInvoiceForm = !showInvoiceForm;
						invoiceError = '';
						invoiceSuccess = '';
					}}
				>
					{showInvoiceForm ? ':q cancel' : ':new invoice'}
				</button>
			</div>

			{#if invoiceSuccess}
				<p class="font-mono text-xs text-green">{invoiceSuccess}</p>
			{/if}

			{#if invoices.data && invoices.data.length > 0}
				<div class="flex flex-col gap-1">
					{#each invoices.data as inv (inv._id)}
						{@const invRecord = inv as unknown as InvoiceRecord}
						{@const dlTheme = getDownloadTheme(invRecord._id)}
						<div
							class="flex flex-col gap-2 border border-border px-3 py-2 font-mono text-sm"
						>
							<!-- Row 1: invoice info -->
							<div class="flex items-center gap-3">
								<!-- Invoice number -->
								<span class="shrink-0 font-bold text-primary">
									{invRecord.invoiceNumber}
								</span>

								<!-- Client -->
								<span class="min-w-0 truncate text-fg">
									{invRecord.clientName}
								</span>

								<!-- Period -->
								<span class="shrink-0 text-xs text-fg-muted">
									{formatDate(invRecord.startDate, timezone)}
									-
									{formatDate(invRecord.endDate, timezone)}
								</span>

								<!-- Total -->
								<span class="ml-auto shrink-0 text-green">
									{invRecord.total.toFixed(2)}
									{invRecord.currency}
								</span>

								<!-- Status badge -->
								<button
									type="button"
									class="shrink-0 cursor-pointer border px-2 py-0.5 font-mono text-xs transition-colors"
									class:border-fg-muted={invRecord.status === 'draft'}
									class:text-fg-muted={invRecord.status === 'draft'}
									class:border-yellow={invRecord.status === 'sent'}
									class:text-yellow={invRecord.status === 'sent'}
									class:border-green={invRecord.status === 'paid'}
									class:text-green={invRecord.status === 'paid'}
									title="click to cycle status"
									onclick={() => cycleInvoiceStatus(invRecord)}
								>
									{invRecord.status}
								</button>
							</div>

							<!-- Row 2: actions -->
							<div class="flex items-center gap-2">
								<!-- Theme toggle (button group) -->
								<div class="flex items-center">
									<button
										type="button"
										class="relative cursor-pointer border px-2 py-0.5 font-mono text-xs transition-colors"
										class:z-10={dlTheme === 'dark'}
										class:border-primary={dlTheme === 'dark'}
										class:text-primary={dlTheme === 'dark'}
										class:bg-surface-2={dlTheme === 'dark'}
										class:border-border={dlTheme !== 'dark'}
										class:text-fg-muted={dlTheme !== 'dark'}
										onclick={() =>
											invoiceDownloadThemes.set(invRecord._id, 'dark')}
									>
										dark
									</button>
									<button
										type="button"
										class="relative -ml-px cursor-pointer border px-2 py-0.5 font-mono text-xs transition-colors"
										class:z-10={dlTheme === 'light'}
										class:border-primary={dlTheme === 'light'}
										class:text-primary={dlTheme === 'light'}
										class:bg-surface-2={dlTheme === 'light'}
										class:border-border={dlTheme !== 'light'}
										class:text-fg-muted={dlTheme !== 'light'}
										onclick={() =>
											invoiceDownloadThemes.set(invRecord._id, 'light')}
									>
										light
									</button>
								</div>

								<!-- Download -->
								<button
									type="button"
									class="cursor-copy border border-border px-2 py-0.5 font-mono text-xs text-fg-muted transition-colors hover:border-primary hover:text-primary"
									title="download PDF"
									onclick={() => redownloadInvoice(invRecord, dlTheme)}
								>
									download
								</button>

								<!-- Follow-up -->
								<button
									type="button"
									class="ml-auto cursor-alias border border-border px-2 py-0.5 font-mono text-xs text-fg-muted transition-colors hover:border-green hover:text-green"
									title="create follow-up invoice pre-filled from this one"
									onclick={() => prefillFromInvoice(invRecord)}
								>
									follow-up
								</button>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="py-4 text-center font-mono text-sm text-fg-muted">
					no invoices yet
				</div>
			{/if}
		</section>

		<!-- ─── Invoice creation form ────────────────────────────── -->
		{#if showInvoiceForm}
			<section class="flex flex-col gap-4 border border-border p-4">
				<h2 class="font-mono text-sm font-bold text-fg-dark">-- new invoice</h2>

				<!-- Invoice number + PDF theme -->
				<div class="flex flex-wrap items-end gap-3">
					<div class="flex flex-col gap-1">
						<label for="inv-number" class="font-mono text-xs text-fg-muted">
							invoice #
						</label>
						<input
							id="inv-number"
							type="text"
							bind:value={invNumber}
							class="{inputClass} w-40"
							placeholder="INV-001"
						/>
					</div>
					<div class="flex flex-col gap-1">
						<span class="font-mono text-xs text-fg-muted">pdf theme</span>
						<div class="flex items-center">
							<button
								type="button"
								class="relative cursor-pointer border px-3 py-2 font-mono text-xs transition-colors"
								class:z-10={invTheme === 'dark'}
								class:border-primary={invTheme === 'dark'}
								class:text-primary={invTheme === 'dark'}
								class:bg-surface-2={invTheme === 'dark'}
								class:border-border={invTheme !== 'dark'}
								class:text-fg-muted={invTheme !== 'dark'}
								onclick={() => (invTheme = 'dark')}
							>
								dark
							</button>
							<button
								type="button"
								class="relative -ml-px cursor-pointer border px-3 py-2 font-mono text-xs transition-colors"
								class:z-10={invTheme === 'light'}
								class:border-primary={invTheme === 'light'}
								class:text-primary={invTheme === 'light'}
								class:bg-surface-2={invTheme === 'light'}
								class:border-border={invTheme !== 'light'}
								class:text-fg-muted={invTheme !== 'light'}
								onclick={() => (invTheme = 'light')}
							>
								light
							</button>
						</div>
					</div>
				</div>

				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<!-- From column -->
					<div class="flex flex-col gap-3">
						<span class="font-mono text-xs text-fg-muted">from (you)</span>
						<div class="flex flex-col gap-1">
							<label
								for="inv-from-name"
								class="font-mono text-xs text-fg-muted"
							>
								name
							</label>
							<input
								id="inv-from-name"
								type="text"
								bind:value={invFromName}
								class={inputClass}
								placeholder="Your Name"
							/>
						</div>
						<div class="flex flex-col gap-1">
							<label
								for="inv-from-email"
								class="font-mono text-xs text-fg-muted"
							>
								email
							</label>
							<input
								id="inv-from-email"
								type="email"
								bind:value={invFromEmail}
								class={inputClass}
								placeholder="you@example.com"
							/>
						</div>
						<div class="flex flex-col gap-1">
							<label
								for="inv-from-address"
								class="font-mono text-xs text-fg-muted"
							>
								address
							</label>
							<textarea
								id="inv-from-address"
								bind:value={invFromAddress}
								class={inputClass}
								rows="2"
								placeholder="123 Main St..."
							></textarea>
						</div>
					</div>

					<!-- Client column -->
					<div class="flex flex-col gap-3">
						<span class="font-mono text-xs text-fg-muted">
							bill to (client)
						</span>
						<div class="flex flex-col gap-1">
							<label
								for="inv-client-name"
								class="font-mono text-xs text-fg-muted"
							>
								client name
							</label>
							<input
								id="inv-client-name"
								type="text"
								bind:value={invClientName}
								class={inputClass}
								placeholder="Client Name"
							/>
						</div>
						<div class="flex flex-col gap-1">
							<label
								for="inv-client-address"
								class="font-mono text-xs text-fg-muted"
							>
								client address
							</label>
							<textarea
								id="inv-client-address"
								bind:value={invClientAddress}
								class={inputClass}
								rows="2"
								placeholder="456 Business Ave..."
							></textarea>
						</div>
					</div>
				</div>

				<!-- Billing details -->
				<div class="flex flex-wrap gap-3">
					<div class="flex flex-col gap-1">
						<label for="inv-rate" class="font-mono text-xs text-fg-muted">
							hourly rate
						</label>
						<input
							id="inv-rate"
							type="number"
							bind:value={invHourlyRate}
							class="{inputClass} w-32"
							min="0"
							step="0.01"
						/>
					</div>
					<div class="flex flex-col gap-1">
						<label for="inv-currency" class="font-mono text-xs text-fg-muted">
							currency
						</label>
						<select
							id="inv-currency"
							bind:value={invCurrency}
							class={inputClass}
						>
							{#each currencies as cur (cur)}
								<option value={cur}>{cur}</option>
							{/each}
						</select>
					</div>
					<div class="flex flex-col gap-1">
						<label for="inv-terms" class="font-mono text-xs text-fg-muted">
							payment terms
						</label>
						<input
							id="inv-terms"
							type="text"
							bind:value={invPaymentTerms}
							class={inputClass}
							placeholder="Net 30"
						/>
					</div>
					<div class="flex flex-col gap-1">
						<label for="inv-due" class="font-mono text-xs text-fg-muted">
							due date
						</label>
						<input
							id="inv-due"
							type="date"
							bind:value={invDueDate}
							class={inputClass}
						/>
					</div>
				</div>

				<!-- Line items preview -->
				<div class="flex flex-col gap-4">
					<!-- Session-based items -->
					{#if computedLineItems.length > 0}
						<div class="flex flex-col gap-2">
							<span class="font-mono text-xs text-fg-muted">
								session items (auto-grouped by project tag)
							</span>
							<div class="border border-border">
								<!-- Header -->
								<div
									class="flex items-center gap-2 border-b border-border bg-surface-2 px-3 py-1.5 font-mono text-xs text-fg-muted"
								>
									<span class="flex-1">project</span>
									<span class="w-16 text-right">hours</span>
									<span class="w-20 text-right">amount</span>
								</div>
								<!-- Rows -->
								{#each computedLineItems as item (item.label)}
									<div
										class="flex items-center gap-2 border-b border-border px-3 py-1.5 font-mono text-sm last:border-b-0"
									>
										<span class="flex-1 text-fg">{item.label}</span>
										<span class="w-16 text-right text-fg-muted">
											{(item.hours ?? 0).toFixed(1)}
										</span>
										<span class="w-20 text-right text-green">
											{item.amount.toFixed(2)}
										</span>
									</div>
								{/each}
							</div>
						</div>
					{:else if invHourlyRate > 0}
						<p class="font-mono text-xs text-fg-muted">
							no completed sessions in this period
						</p>
					{/if}

					<!-- Custom line items -->
					<div class="flex flex-col gap-2">
						<span class="font-mono text-xs text-fg-muted">
							custom items (subscriptions, hosting, products, etc.)
						</span>

						{#if customLineItems.length > 0}
							<div class="border border-border">
								<!-- Header -->
								<div
									class="flex items-center gap-2 border-b border-border bg-surface-2 px-3 py-1.5 font-mono text-xs text-fg-muted"
								>
									<span class="flex-1">description</span>
									<span class="w-14 text-right">qty</span>
									<span class="w-20 text-right">unit price</span>
									<span class="w-20 text-right">amount</span>
									<span class="w-8"></span>
								</div>
								<!-- Editable rows -->
								{#each customLineItems as item, i (i)}
									{@const lineAmount =
										Math.round((item.quantity || 1) * item.unitPrice * 100) /
										100}
									<div
										class="flex items-center gap-2 border-b border-border px-3 py-1.5 font-mono text-sm last:border-b-0"
									>
										<input
											type="text"
											bind:value={item.label}
											placeholder="hosting, subscription..."
											class="flex-1 border-none bg-transparent p-0 font-mono text-sm text-fg placeholder:text-fg-muted/50 focus:ring-0"
										/>
										<input
											type="number"
											bind:value={item.quantity}
											min="1"
											step="1"
											class="w-14 border-none bg-transparent p-0 text-right font-mono text-sm text-fg-muted focus:ring-0"
										/>
										<input
											type="number"
											bind:value={item.unitPrice}
											min="0"
											step="0.01"
											class="w-20 border-none bg-transparent p-0 text-right font-mono text-sm text-fg-muted focus:ring-0"
										/>
										<span class="w-20 text-right text-green">
											{lineAmount.toFixed(2)}
										</span>
										<button
											type="button"
											class="w-8 text-center font-mono text-fg-muted transition-colors hover:text-red"
											onclick={() => removeCustomLineItem(i)}
											title="remove item"
										>
											×
										</button>
									</div>
								{/each}
							</div>
						{/if}

						<button
							type="button"
							class="self-start border border-dashed border-border px-3 py-1 font-mono text-xs text-fg-muted transition-colors hover:border-primary hover:text-primary"
							onclick={addCustomLineItem}
						>
							:add item
						</button>
					</div>

					<!-- Combined total -->
					{#if allLineItems.length > 0}
						<div class="border border-border-highlight">
							<div
								class="flex items-center gap-2 bg-surface-2 px-3 py-1.5 font-mono text-sm font-bold"
							>
								<span class="flex-1 text-fg-dark">total</span>
								<span class="w-20 text-right text-green">
									{invoiceSubtotal.toFixed(2)}
								</span>
							</div>
						</div>
					{/if}
				</div>

				<!-- Notes -->
				<div class="flex flex-col gap-1">
					<label for="inv-notes" class="font-mono text-xs text-fg-muted">
						notes
					</label>
					<textarea
						id="inv-notes"
						bind:value={invNotes}
						class={inputClass}
						rows="2"
						placeholder="Thank you for your business..."
					></textarea>
				</div>

				<!-- Error / Submit -->
				{#if invoiceError}
					<p class="font-mono text-xs text-red">{invoiceError}</p>
				{/if}

				<button
					type="button"
					class="cursor-copy border border-green px-4 py-2 font-mono text-sm text-green transition-colors hover:bg-green hover:text-bg-dark disabled:cursor-wait disabled:opacity-50"
					disabled={invoiceSaving}
					onclick={handleCreateInvoice}
				>
					{invoiceSaving ? 'creating...' : ':w create & download'}
				</button>
			</section>
		{/if}
	{/if}
</div>
