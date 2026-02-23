/**
 * FileDataProvider — implements the DataProvider interface for the desktop app.
 *
 * Reads/writes plain-text files via Tauri IPC commands. Uses Svelte 5
 * runes ($state) for reactivity. When data is written, the in-memory
 * state is updated immediately (optimistic) and the file write happens
 * in the background.
 */

import { invoke } from '@tauri-apps/api/core';
import type {
	DataProvider,
	TaskRepository,
	SessionRepository,
	TagRepository,
	InvoiceRepository,
	SettingsRepository,
	ReactiveValue,
	Task,
	Session,
	Tag,
	Invoice,
	UserSettings
} from '@writequit/ui';

import {
	parseTaskFile,
	serializeTaskFile,
	parseSessionLedger,
	serializeSessionLedger,
	parseTagsYaml,
	serializeTagsYaml,
	parseSettingsYaml,
	serializeSettingsYaml,
	parseInvoiceYaml,
	serializeInvoiceYaml,
	slugify,
	ensureUniqueSlug
} from './formats.js';

// ── Reactive state wrapper ──────────────────────────────────────────

class ReactiveState<T> implements ReactiveValue<T> {
	current = $state<T | undefined>(undefined);
	isLoading = $state(true);
	error = $state<Error | undefined>(undefined);

	set(value: T) {
		this.current = value;
		this.isLoading = false;
		this.error = undefined;
	}

	setError(err: Error) {
		this.error = err;
		this.isLoading = false;
	}
}

// ── FileDataProvider ────────────────────────────────────────────────

export function createFileDataProvider(): DataProvider {
	// Shared state caches
	const tasksState = new ReactiveState<Task[]>();
	const tagsState = new ReactiveState<Tag[]>();
	const sessionsState = new ReactiveState<Session[]>();
	const settingsState = new ReactiveState<UserSettings | null>();

	// ── Load initial data ───────────────────────────────────────────

	async function loadTasks() {
		try {
			const slugs = await invoke<string[]>('cmd_list_tasks');
			const tasks: Task[] = [];

			for (const slug of slugs) {
				try {
					const content = await invoke<string>('cmd_read_task', {
						slug
					});
					tasks.push(parseTaskFile(slug, content));
				} catch {
					// Skip unreadable files
				}
			}

			// Resolve tag objects
			const tags = tagsState.current ?? [];
			for (const task of tasks) {
				task.tags = task.tagIds
					.map((name) => tags.find((t) => t.name === name))
					.filter((t): t is Tag => !!t);
			}

			// Sort: active first, then inbox, then done
			tasks.sort((a, b) => (a.statusPriority ?? 1) - (b.statusPriority ?? 1));

			tasksState.set(tasks);
		} catch (err) {
			tasksState.setError(err instanceof Error ? err : new Error(String(err)));
		}
	}

	async function loadTags() {
		try {
			const content = await invoke<string>('cmd_read_tags');
			tagsState.set(parseTagsYaml(content));
		} catch (err) {
			tagsState.setError(err instanceof Error ? err : new Error(String(err)));
		}
	}

	async function loadSessions() {
		try {
			const content = await invoke<string>('cmd_read_sessions');
			const sessions = parseSessionLedger(content);

			// Resolve tags
			const tags = tagsState.current ?? [];
			for (const session of sessions) {
				session.tags = session.tagIds
					.map((name) => tags.find((t) => t.name === name))
					.filter((t): t is Tag => !!t);
			}

			sessionsState.set(sessions);
		} catch (err) {
			sessionsState.setError(
				err instanceof Error ? err : new Error(String(err))
			);
		}
	}

	async function loadSettings() {
		try {
			const content = await invoke<string>('cmd_read_settings');
			settingsState.set(parseSettingsYaml(content));
		} catch (err) {
			settingsState.setError(
				err instanceof Error ? err : new Error(String(err))
			);
		}
	}

	// Bootstrap: load tags first (needed for resolving task/session tags)
	loadTags().then(() => {
		loadTasks();
		loadSessions();
	});
	loadSettings();

	// ── Task repository ─────────────────────────────────────────────

	const tasks: TaskRepository = {
		list(opts) {
			// Filter from the cached state
			const filtered = new ReactiveState<Task[]>();
			const update = () => {
				const all = tasksState.current ?? [];
				let result = all;

				if (opts?.status) {
					result = result.filter((t) => t.status === opts.status);
				}
				if (opts?.tagIds?.length) {
					result = result.filter((t) =>
						opts.tagIds!.some((id) => t.tagIds.includes(id))
					);
				}

				filtered.set(result);
			};

			// Initial filter
			if (!tasksState.isLoading) update();

			// Re-filter whenever tasks change
			$effect.root(() => {
				$effect(() => {
					// Track dependency on tasksState.current
					// eslint-disable-next-line @typescript-eslint/no-unused-expressions
					tasksState.current;
					update();
				});
			});

			return filtered;
		},

		get(id) {
			const state = new ReactiveState<Task | null>();

			$effect.root(() => {
				$effect(() => {
					const all = tasksState.current;
					if (all) {
						state.set(all.find((t) => t.id === id) ?? null);
					}
				});
			});

			return state;
		},

		search(query) {
			const state = new ReactiveState<Task[]>();
			const lower = query.toLowerCase();

			$effect.root(() => {
				$effect(() => {
					const all = tasksState.current ?? [];
					state.set(
						all.filter(
							(t) =>
								t.title.toLowerCase().includes(lower) ||
								t.rawContent.toLowerCase().includes(lower)
						)
					);
				});
			});

			return state;
		},

		async create(rawContent) {
			const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
			const { parseTask } = await import('@writequit/ui');
			const parsed = parseTask(rawContent, tz);
			const existingSlugs = (tasksState.current ?? []).map((t) => t.id);
			const slug = ensureUniqueSlug(
				slugify(parsed.title || 'untitled'),
				existingSlugs
			);

			const content = serializeTaskFile({
				status: 'inbox',
				createdAt: Date.now(),
				rawContent
			});

			await invoke('cmd_write_task', { slug, content });
			await loadTasks();
			return slug;
		},

		async update(id, rawContent) {
			const existing = (tasksState.current ?? []).find((t) => t.id === id);
			if (!existing) throw new Error(`Task not found: ${id}`);

			const content = serializeTaskFile({
				status: existing.status,
				createdAt: existing.createdAt,
				rawContent
			});

			// Check if title changed -> might need rename
			const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
			const { parseTask } = await import('@writequit/ui');
			const parsed = parseTask(rawContent, tz);
			const newSlug = slugify(parsed.title || 'untitled');

			if (newSlug !== id) {
				const existingSlugs = (tasksState.current ?? [])
					.filter((t) => t.id !== id)
					.map((t) => t.id);
				const uniqueSlug = ensureUniqueSlug(newSlug, existingSlugs);
				await invoke('cmd_write_task', {
					slug: uniqueSlug,
					content
				});
				await invoke('cmd_delete_task', { slug: id });
			} else {
				await invoke('cmd_write_task', { slug: id, content });
			}

			await loadTasks();
		},

		async updateStatus(id, status) {
			const existing = (tasksState.current ?? []).find((t) => t.id === id);
			if (!existing) throw new Error(`Task not found: ${id}`);

			const content = serializeTaskFile({
				status,
				createdAt: existing.createdAt,
				rawContent: existing.rawContent
			});

			await invoke('cmd_write_task', { slug: id, content });
			await loadTasks();
		},

		async remove(id) {
			await invoke('cmd_delete_task', { slug: id });
			await loadTasks();
		}
	};

	// ── Session repository ──────────────────────────────────────────

	const sessions: SessionRepository = {
		list(opts) {
			const state = new ReactiveState<Session[]>();

			$effect.root(() => {
				$effect(() => {
					let all = sessionsState.current ?? [];

					if (opts?.startAfter) {
						all = all.filter((s) => s.startTime >= opts.startAfter!);
					}
					if (opts?.endBefore) {
						all = all.filter(
							(s) => (s.endTime ?? Date.now()) <= opts.endBefore!
						);
					}
					if (opts?.tagIds?.length) {
						all = all.filter((s) =>
							opts.tagIds!.some((id) => s.tagIds.includes(id))
						);
					}

					state.set(all);
				});
			});

			return state;
		},

		listWithTasks(opts) {
			// Same as list but also resolves task objects
			const state = new ReactiveState<Session[]>();

			$effect.root(() => {
				$effect(() => {
					let all = sessionsState.current ?? [];
					const allTasks = tasksState.current ?? [];

					if (opts?.startAfter) {
						all = all.filter((s) => s.startTime >= opts.startAfter!);
					}
					if (opts?.endBefore) {
						all = all.filter(
							(s) => (s.endTime ?? Date.now()) <= opts.endBefore!
						);
					}
					if (opts?.tagIds?.length) {
						all = all.filter((s) =>
							opts.tagIds!.some((id) => s.tagIds.includes(id))
						);
					}

					// Resolve tasks
					for (const session of all) {
						session.tasks = session.taskIds
							.map((id) => allTasks.find((t) => t.id === id))
							.filter((t): t is Task => !!t);
					}

					state.set(all);
				});
			});

			return state;
		},

		get(id) {
			const state = new ReactiveState<Session | null>();

			$effect.root(() => {
				$effect(() => {
					const all = sessionsState.current;
					if (all) {
						state.set(all.find((s) => s.id === id) ?? null);
					}
				});
			});

			return state;
		},

		active() {
			const state = new ReactiveState<Session | null>();

			$effect.root(() => {
				$effect(() => {
					const all = sessionsState.current ?? [];
					state.set(all.find((s) => s.endTime === undefined) ?? null);
				});
			});

			return state;
		},

		async log(args) {
			const all = sessionsState.current ?? [];
			const d = new Date(args.startTime); // eslint-disable-line svelte/prefer-svelte-reactivity -- temporary, not reactive
			const newSession: Session = {
				id: `${d.toISOString().split('T')[0]}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`,
				startTime: args.startTime,
				endTime: args.endTime,
				description: args.description,
				tagIds: args.tags,
				taskIds: [],
				createdAt: Date.now(),
				updatedAt: Date.now()
			};

			const updated = [...all, newSession].sort(
				(a, b) => a.startTime - b.startTime
			);
			await invoke('cmd_write_sessions', {
				content: serializeSessionLedger(updated)
			});
			await loadSessions();
			return newSession.id;
		},

		async start(args) {
			const startTime = args.startTime ?? Date.now();
			return sessions
				.log({
					startTime,
					endTime: 0, // Will be replaced by undefined in the session
					description: args.description,
					tags: args.tags
				})
				.then(async (id) => {
					// Patch: set endTime to undefined for running session
					const all = sessionsState.current ?? [];
					const session = all.find((s) => s.id === id);
					if (session) {
						session.endTime = undefined;
						await invoke('cmd_write_sessions', {
							content: serializeSessionLedger(all)
						});
						await loadSessions();
					}
					return id;
				});
		},

		async stop() {
			const all = sessionsState.current ?? [];
			const active = all.find((s) => s.endTime === undefined);
			if (!active) throw new Error('No timer is running');

			active.endTime = Date.now();
			active.updatedAt = Date.now();

			await invoke('cmd_write_sessions', {
				content: serializeSessionLedger(all)
			});
			await loadSessions();
		},

		async update(id, args) {
			const all = sessionsState.current ?? [];
			const session = all.find((s) => s.id === id);
			if (!session) throw new Error(`Session not found: ${id}`);

			if (args.startTime !== undefined) session.startTime = args.startTime;
			if (args.endTime !== undefined) session.endTime = args.endTime;
			if (args.description !== undefined)
				session.description = args.description;
			if (args.tags !== undefined) session.tagIds = args.tags;
			session.updatedAt = Date.now();

			await invoke('cmd_write_sessions', {
				content: serializeSessionLedger(all)
			});
			await loadSessions();
		},

		async linkTask(sessionId, taskId) {
			const all = sessionsState.current ?? [];
			const session = all.find((s) => s.id === sessionId);
			if (!session) throw new Error(`Session not found: ${sessionId}`);

			if (!session.taskIds.includes(taskId)) {
				session.taskIds.push(taskId);
				session.updatedAt = Date.now();

				await invoke('cmd_write_sessions', {
					content: serializeSessionLedger(all)
				});
				await loadSessions();
			}
		},

		async unlinkTask(sessionId, taskId) {
			const all = sessionsState.current ?? [];
			const session = all.find((s) => s.id === sessionId);
			if (!session) throw new Error(`Session not found: ${sessionId}`);

			session.taskIds = session.taskIds.filter((id) => id !== taskId);
			session.updatedAt = Date.now();

			await invoke('cmd_write_sessions', {
				content: serializeSessionLedger(all)
			});
			await loadSessions();
		},

		async remove(id) {
			const all = (sessionsState.current ?? []).filter((s) => s.id !== id);

			await invoke('cmd_write_sessions', {
				content: serializeSessionLedger(all)
			});
			await loadSessions();
		}
	};

	// ── Tag repository ──────────────────────────────────────────────

	const tags: TagRepository = {
		list() {
			return tagsState;
		},

		get(id) {
			const state = new ReactiveState<Tag | null>();

			$effect.root(() => {
				$effect(() => {
					const all = tagsState.current;
					if (all) {
						state.set(all.find((t) => t.id === id) ?? null);
					}
				});
			});

			return state;
		},

		async create(name, type, color) {
			const all = tagsState.current ?? [];
			const tag: Tag = {
				id: name,
				name,
				type,
				color,
				createdAt: Date.now()
			};

			const updated = [...all, tag];
			await invoke('cmd_write_tags', {
				content: serializeTagsYaml(updated)
			});
			await loadTags();
			return name;
		},

		async update(id, args) {
			const all = tagsState.current ?? [];
			const tag = all.find((t) => t.id === id);
			if (!tag) throw new Error(`Tag not found: ${id}`);

			if (args.name !== undefined) {
				tag.name = args.name;
				tag.id = args.name;
			}
			if (args.type !== undefined) tag.type = args.type;
			if (args.color !== undefined) tag.color = args.color;

			await invoke('cmd_write_tags', {
				content: serializeTagsYaml(all)
			});
			await loadTags();
		},

		async remove(id) {
			const all = (tagsState.current ?? []).filter((t) => t.id !== id);

			await invoke('cmd_write_tags', {
				content: serializeTagsYaml(all)
			});
			await loadTags();
		}
	};

	// ── Invoice repository ──────────────────────────────────────────

	const invoicesState = new ReactiveState<Invoice[]>();
	const nextNumberState = new ReactiveState<string>();

	async function loadInvoices() {
		try {
			const names = await invoke<string[]>('cmd_list_invoices');
			const invoices: Invoice[] = [];

			for (const name of names) {
				try {
					const content = await invoke<string>('cmd_read_invoice', { name });
					invoices.push(parseInvoiceYaml(name, content));
				} catch {
					// Skip unreadable files
				}
			}

			invoices.sort((a, b) => b.createdAt - a.createdAt);
			invoicesState.set(invoices);

			// Compute next number
			const lastNumber =
				invoices.length > 0 ? invoices[0].invoiceNumber : 'INV-000';
			const num = parseInt(lastNumber.replace(/[^0-9]/g, '') || '0') + 1;
			nextNumberState.set(`INV-${String(num).padStart(3, '0')}`);
		} catch (err) {
			invoicesState.setError(
				err instanceof Error ? err : new Error(String(err))
			);
		}
	}

	loadInvoices();

	const invoices: InvoiceRepository = {
		list() {
			return invoicesState;
		},

		get(id) {
			const state = new ReactiveState<Invoice | null>();

			$effect.root(() => {
				$effect(() => {
					const all = invoicesState.current;
					if (all) {
						state.set(all.find((i) => i.id === id) ?? null);
					}
				});
			});

			return state;
		},

		getNextNumber() {
			return nextNumberState;
		},

		async create(args) {
			const invoice: Invoice = {
				id: args.invoiceNumber,
				...args,
				status: 'draft',
				createdAt: Date.now()
			};

			await invoke('cmd_write_invoice', {
				name: args.invoiceNumber,
				content: serializeInvoiceYaml(invoice)
			});
			await loadInvoices();
			return args.invoiceNumber;
		},

		async updateStatus(id, status) {
			const all = invoicesState.current ?? [];
			const invoice = all.find((i) => i.id === id);
			if (!invoice) throw new Error(`Invoice not found: ${id}`);

			invoice.status = status;

			await invoke('cmd_write_invoice', {
				name: id,
				content: serializeInvoiceYaml(invoice)
			});
			await loadInvoices();
		},

		async remove(id) {
			await invoke('cmd_delete_invoice', { name: id });
			await loadInvoices();
		}
	};

	// ── Settings repository ─────────────────────────────────────────

	const settingsRepo: SettingsRepository = {
		get() {
			return settingsState;
		},

		async update(partial) {
			const current = settingsState.current ?? {
				viMode: true,
				defaultStatusFilter: 'active' as const,
				defaultTagFilter: 'all' as const
			};

			const updated = { ...current, ...partial };

			await invoke('cmd_write_settings', {
				content: serializeSettingsYaml(updated)
			});
			settingsState.set(updated);
		}
	};

	return {
		tasks,
		sessions,
		tags,
		invoices,
		settings: settingsRepo
	};
}
