/**
 * Plain-text file format parsers and serializers for writequit desktop.
 *
 * These handle the conversion between the human-readable file formats
 * and the shared TypeScript interfaces from @writequit/ui.
 */

import type {
	Task,
	TaskStatus,
	Session,
	Tag,
	TagType,
	Invoice,
	InvoiceLineItem,
	UserSettings,
	StatusFilter,
	TagFilter,
	AutoLinkMode,
	InvoiceTheme
} from '@writequit/ui';
import { parseTask } from '@writequit/ui';

// ── Slug utilities ──────────────────────────────────────────────────

export function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80);
}

export function ensureUniqueSlug(slug: string, existing: string[]): string {
	if (!existing.includes(slug)) return slug;
	let i = 2;
	while (existing.includes(`${slug}-${i}`)) i++;
	return `${slug}-${i}`;
}

// ── Task file format ────────────────────────────────────────────────
//
// ```markdown
// ---
// status: active
// created: 2026-02-20T10:00:00Z
// ---
// # Fix auth redirect bug
//
// +project-x +urgent due:2026-02-25
//
// The redirect callback fails...
// ```

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;

export function parseTaskFile(slug: string, content: string): Task {
	let status: TaskStatus = 'inbox';
	let createdAt = Date.now();
	let rawContent = content;

	// Parse frontmatter
	const match = content.match(FRONTMATTER_RE);
	if (match) {
		const frontmatter = match[1];
		rawContent = match[2];

		for (const line of frontmatter.split('\n')) {
			const [key, ...rest] = line.split(':');
			const value = rest.join(':').trim();
			if (key.trim() === 'status') {
				if (value === 'inbox' || value === 'active' || value === 'done') {
					status = value;
				}
			} else if (key.trim() === 'created') {
				const ts = new Date(value).getTime();
				if (!isNaN(ts)) createdAt = ts;
			}
		}
	}

	// Use the shared parser to extract title, tags, due date
	const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const parsed = parseTask(rawContent, tz);

	const statusPriority = status === 'active' ? 0 : status === 'inbox' ? 1 : 2;

	return {
		id: slug,
		rawContent,
		title: parsed.title,
		status,
		statusPriority,
		dueDate: parsed.dueDate ?? undefined,
		tagIds: parsed.tags, // Tag names as IDs in the desktop app
		createdAt,
		updatedAt: createdAt // Will be set from file mtime in practice
	};
}

export function serializeTaskFile(task: {
	status: TaskStatus;
	createdAt: number;
	rawContent: string;
}): string {
	const created = new Date(task.createdAt).toISOString();
	return `---\nstatus: ${task.status}\ncreated: ${created}\n---\n${task.rawContent}`;
}

// ── Session ledger format ───────────────────────────────────────────
//
// ```
// ; writequit session ledger
//
// 2026-02-20 09:00-12:30 +project-x
//   Worked on auth fix
//   tasks: fix-auth-redirect-bug
//
// 2026-02-20 17:00-
//   ; running session (no end time = active)
//   Currently investigating issue
// ```

export function parseSessionLedger(content: string): Session[] {
	const sessions: Session[] = [];
	const blocks = content.split(/\n\n+/);

	for (const block of blocks) {
		const lines = block.split('\n').filter((l) => l.trim());
		if (lines.length === 0) continue;

		const headerLine = lines[0];
		// Skip comment-only lines
		if (headerLine.startsWith(';')) continue;

		// Parse header: DATE START-END +tags...
		const headerMatch = headerLine.match(
			/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})-(\d{1,2}:\d{2})?\s*(.*)?$/
		);
		if (!headerMatch) continue;

		const [, dateStr, startTimeStr, endTimeStr, tagStr] = headerMatch;

		// Parse times
		const startTime = parseDateTime(dateStr, startTimeStr);
		const endTime = endTimeStr ? parseDateTime(dateStr, endTimeStr) : undefined;

		// Parse tags from header
		const tags: string[] = [];
		if (tagStr) {
			for (const part of tagStr.split(/\s+/)) {
				if (part.startsWith('+')) {
					tags.push(part.slice(1));
				}
			}
		}

		// Parse indented body lines
		let description: string | undefined;
		const taskIds: string[] = [];

		for (let i = 1; i < lines.length; i++) {
			const line = lines[i].trim();
			if (line.startsWith(';')) continue; // comment

			if (line.startsWith('tasks:')) {
				const taskList = line.slice(6).trim();
				taskIds.push(
					...taskList
						.split(',')
						.map((t) => t.trim())
						.filter(Boolean)
				);
			} else if (!description) {
				description = line;
			}
		}

		const id = `${dateStr}-${startTimeStr.replace(':', '')}`;

		sessions.push({
			id,
			startTime,
			endTime,
			description,
			tagIds: tags,
			taskIds,
			createdAt: startTime,
			updatedAt: endTime ?? startTime
		});
	}

	return sessions;
}

export function serializeSessionLedger(sessions: Session[]): string {
	let out = '; writequit session ledger\n';

	for (const session of sessions) {
		const date = formatDateISO(session.startTime);
		const start = formatTimeHHMM(session.startTime);
		const end = session.endTime ? formatTimeHHMM(session.endTime) : '';

		let header = `\n${date} ${start}-${end}`;
		if (session.tagIds.length > 0) {
			header += ' ' + session.tagIds.map((t) => `+${t}`).join(' ');
		}

		out += header + '\n';

		if (session.description) {
			out += `  ${session.description}\n`;
		}

		if (session.taskIds.length > 0) {
			out += `  tasks: ${session.taskIds.join(', ')}\n`;
		}
	}

	return out;
}

// ── Tag YAML format ─────────────────────────────────────────────────
//
// ```yaml
// project-x:
//   type: project
//   color: "#ff6b6b"
// ```

export function parseTagsYaml(content: string): Tag[] {
	const tags: Tag[] = [];

	// Simple YAML parser (no dependency needed for this simple format)
	const lines = content.split('\n');
	let currentTag: string | null = null;
	let currentType: string | undefined;
	let currentColor: string | undefined;

	for (const line of lines) {
		if (line.startsWith('#') || line.trim() === '') continue;

		if (!line.startsWith(' ') && !line.startsWith('\t') && line.endsWith(':')) {
			// Save previous tag
			if (currentTag) {
				tags.push({
					id: currentTag,
					name: currentTag,
					type: currentType as TagType | undefined,
					color: currentColor,
					createdAt: Date.now()
				});
			}

			currentTag = line.slice(0, -1).trim();
			currentType = undefined;
			currentColor = undefined;
		} else if (currentTag) {
			const trimmed = line.trim();
			if (trimmed.startsWith('type:')) {
				currentType = trimmed.slice(5).trim().replace(/['"]/g, '');
			} else if (trimmed.startsWith('color:')) {
				currentColor = trimmed.slice(6).trim().replace(/['"]/g, '');
			}
		}
	}

	// Don't forget the last tag
	if (currentTag) {
		tags.push({
			id: currentTag,
			name: currentTag,
			type: currentType as TagType | undefined,
			color: currentColor,
			createdAt: Date.now()
		});
	}

	return tags;
}

export function serializeTagsYaml(tags: Tag[]): string {
	let out = '# writequit tag definitions\n';

	for (const tag of tags) {
		out += `${tag.name}:\n`;
		if (tag.type) {
			out += `  type: ${tag.type}\n`;
		}
		if (tag.color) {
			out += `  color: "${tag.color}"\n`;
		}
	}

	return out;
}

// ── Settings YAML format ────────────────────────────────────────────

export function parseSettingsYaml(content: string): UserSettings {
	const settings: UserSettings = {
		viMode: true,
		defaultStatusFilter: 'active',
		defaultTagFilter: 'all'
	};

	for (const line of content.split('\n')) {
		if (line.startsWith('#') || line.trim() === '') continue;
		const colonIdx = line.indexOf(':');
		if (colonIdx === -1) continue;

		const key = line.slice(0, colonIdx).trim();
		const value = line
			.slice(colonIdx + 1)
			.trim()
			.replace(/['"]/g, '');

		switch (key) {
			case 'vim_mode':
				settings.viMode = value === 'true';
				break;
			case 'timezone':
				if (value) settings.timezone = value;
				break;
			case 'default_status_filter':
				settings.defaultStatusFilter = value as StatusFilter;
				break;
			case 'default_tag_filter':
				settings.defaultTagFilter = value as TagFilter;
				break;
			case 'invoice_from_address':
				settings.invoiceFromAddress = value;
				break;
			case 'default_hourly_rate':
				settings.defaultHourlyRate = parseFloat(value) || undefined;
				break;
			case 'default_currency':
				settings.defaultCurrency = value || undefined;
				break;
			case 'default_payment_terms':
				settings.defaultPaymentTerms = value || undefined;
				break;
			case 'default_invoice_theme':
				settings.defaultInvoiceTheme = value as InvoiceTheme;
				break;
			case 'tutorial_completed':
				settings.tutorialCompleted = value === 'true';
				break;
			case 'auto_link_mode':
				settings.autoLinkMode = value as AutoLinkMode;
				break;
		}
	}

	return settings;
}

export function serializeSettingsYaml(settings: UserSettings): string {
	let out = '# writequit user settings\n';
	out += `vim_mode: ${settings.viMode}\n`;
	out += `timezone: "${settings.timezone ?? ''}"\n`;
	out += `default_status_filter: ${settings.defaultStatusFilter}\n`;
	out += `default_tag_filter: ${settings.defaultTagFilter}\n`;

	if (settings.invoiceFromAddress)
		out += `invoice_from_address: "${settings.invoiceFromAddress}"\n`;
	if (settings.defaultHourlyRate !== undefined)
		out += `default_hourly_rate: ${settings.defaultHourlyRate}\n`;
	if (settings.defaultCurrency)
		out += `default_currency: ${settings.defaultCurrency}\n`;
	if (settings.defaultPaymentTerms)
		out += `default_payment_terms: "${settings.defaultPaymentTerms}"\n`;
	if (settings.defaultInvoiceTheme)
		out += `default_invoice_theme: ${settings.defaultInvoiceTheme}\n`;
	if (settings.tutorialCompleted !== undefined)
		out += `tutorial_completed: ${settings.tutorialCompleted}\n`;
	if (settings.autoLinkMode)
		out += `auto_link_mode: ${settings.autoLinkMode}\n`;

	return out;
}

// ── Invoice YAML format ─────────────────────────────────────────────

export function parseInvoiceYaml(name: string, content: string): Invoice {
	// Simple key-value YAML parser for invoices
	// For a full implementation, we'd use js-yaml
	const lines = content.split('\n');
	const data: Record<string, string> = {};
	const lineItems: InvoiceLineItem[] = [];
	let inLineItems = false;
	let currentItem: Partial<InvoiceLineItem> | null = null;

	for (const line of lines) {
		if (line.startsWith('#') || line.trim() === '') continue;

		if (line.trim() === 'line_items:') {
			inLineItems = true;
			continue;
		}

		if (inLineItems) {
			if (line.startsWith('  - ') || line.startsWith('  -')) {
				if (currentItem?.label) {
					lineItems.push(currentItem as InvoiceLineItem);
				}
				currentItem = {};
				const rest = line.slice(4).trim();
				if (rest) {
					const [k, ...v] = rest.split(':');
					if (k && v.length) {
						(currentItem as Record<string, unknown>)[k.trim()] = v
							.join(':')
							.trim()
							.replace(/['"]/g, '');
					}
				}
			} else if (line.startsWith('    ') && currentItem) {
				const trimmed = line.trim();
				const [k, ...v] = trimmed.split(':');
				if (k && v.length) {
					const val = v.join(':').trim().replace(/['"]/g, '');
					const key = k.trim();
					if (
						key === 'hours' ||
						key === 'quantity' ||
						key === 'unitPrice' ||
						key === 'amount'
					) {
						(currentItem as Record<string, unknown>)[key] = parseFloat(val);
					} else {
						(currentItem as Record<string, unknown>)[key] = val;
					}
				}
			} else if (!line.startsWith(' ')) {
				// End of line_items
				if (currentItem?.label) {
					lineItems.push(currentItem as InvoiceLineItem);
				}
				currentItem = null;
				inLineItems = false;
				// Parse as regular key
				const colonIdx = line.indexOf(':');
				if (colonIdx !== -1) {
					data[line.slice(0, colonIdx).trim()] = line
						.slice(colonIdx + 1)
						.trim()
						.replace(/['"]/g, '');
				}
			}
		} else {
			const colonIdx = line.indexOf(':');
			if (colonIdx !== -1 && !line.startsWith(' ')) {
				data[line.slice(0, colonIdx).trim()] = line
					.slice(colonIdx + 1)
					.trim()
					.replace(/['"]/g, '');
			}
		}
	}

	// Push last item
	if (currentItem?.label) {
		lineItems.push(currentItem as InvoiceLineItem);
	}

	return {
		id: name,
		invoiceNumber: data['invoice_number'] ?? name,
		status: (data['status'] as Invoice['status']) ?? 'draft',
		startDate: new Date(data['date_from'] ?? 0).getTime(),
		endDate: new Date(data['date_to'] ?? 0).getTime(),
		fromName: data['from_name'] ?? '',
		fromEmail: data['from_email'] ?? '',
		fromAddress: data['from_address'],
		clientName: data['client_name'] ?? '',
		clientAddress: data['client_address'],
		hourlyRate: parseFloat(data['hourly_rate'] ?? '0'),
		currency: data['currency'] ?? 'USD',
		lineItems,
		subtotal: parseFloat(data['subtotal'] ?? '0'),
		total: parseFloat(data['total'] ?? '0'),
		paymentTerms: data['payment_terms'],
		dueDate: data['due_date']
			? new Date(data['due_date']).getTime()
			: undefined,
		notes: data['notes'],
		createdAt: new Date(data['created_at'] ?? Date.now()).getTime()
	};
}

export function serializeInvoiceYaml(invoice: Invoice): string {
	let out = '';
	out += `invoice_number: "${invoice.invoiceNumber}"\n`;
	out += `status: ${invoice.status}\n`;
	out += `date_from: "${new Date(invoice.startDate).toISOString().split('T')[0]}"\n`;
	out += `date_to: "${new Date(invoice.endDate).toISOString().split('T')[0]}"\n`;
	out += `from_name: "${invoice.fromName}"\n`;
	out += `from_email: "${invoice.fromEmail}"\n`;
	if (invoice.fromAddress) out += `from_address: "${invoice.fromAddress}"\n`;
	out += `client_name: "${invoice.clientName}"\n`;
	if (invoice.clientAddress)
		out += `client_address: "${invoice.clientAddress}"\n`;
	out += `hourly_rate: ${invoice.hourlyRate}\n`;
	out += `currency: ${invoice.currency}\n`;
	out += `subtotal: ${invoice.subtotal}\n`;
	out += `total: ${invoice.total}\n`;
	if (invoice.paymentTerms) out += `payment_terms: "${invoice.paymentTerms}"\n`;
	if (invoice.dueDate)
		out += `due_date: "${new Date(invoice.dueDate).toISOString().split('T')[0]}"\n`;
	if (invoice.notes) out += `notes: "${invoice.notes}"\n`;
	out += `created_at: "${new Date(invoice.createdAt).toISOString()}"\n`;

	if (invoice.lineItems.length > 0) {
		out += 'line_items:\n';
		for (const item of invoice.lineItems) {
			out += `  - label: "${item.label}"\n`;
			if (item.hours !== undefined) out += `    hours: ${item.hours}\n`;
			if (item.quantity !== undefined)
				out += `    quantity: ${item.quantity}\n`;
			if (item.unitPrice !== undefined)
				out += `    unitPrice: ${item.unitPrice}\n`;
			out += `    amount: ${item.amount}\n`;
		}
	}

	return out;
}

// ── Time helpers ────────────────────────────────────────────────────

function parseDateTime(dateStr: string, timeStr: string): number {
	return new Date(`${dateStr}T${timeStr.padStart(5, '0')}:00`).getTime();
}

function formatDateISO(ts: number): string {
	return new Date(ts).toISOString().split('T')[0];
}

function formatTimeHHMM(ts: number): string {
	const d = new Date(ts);
	return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
