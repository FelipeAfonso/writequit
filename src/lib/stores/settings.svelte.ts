/**
 * Persistent user settings backed by localStorage.
 *
 * All settings live under a single `wq:settings` key as JSON.
 * Reactive via Svelte 5 runes — reads/writes are fine-grained.
 * SSR-safe: falls back to defaults when localStorage is unavailable.
 */

const STORAGE_KEY = 'wq:settings';

interface Settings {
	/** Active status filter on the tasks page. */
	statusFilter: 'all' | 'inbox' | 'active' | 'done';
	/** Active tag IDs for filtering (stored as array, used as Set). */
	activeTagIds: string[];
}

const DEFAULTS: Settings = {
	statusFilter: 'all',
	activeTagIds: []
};

function load(): Settings {
	if (typeof localStorage === 'undefined') return { ...DEFAULTS };
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return { ...DEFAULTS };
		const parsed = JSON.parse(raw) as Partial<Settings>;
		return { ...DEFAULTS, ...parsed };
	} catch {
		return { ...DEFAULTS };
	}
}

function save(settings: Settings): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
	} catch {
		// Storage full or unavailable — silently ignore
	}
}

function createSettings() {
	const initial = load();

	let statusFilter = $state<Settings['statusFilter']>(initial.statusFilter);
	let activeTagIds = $state<string[]>(initial.activeTagIds);

	function persist() {
		save({ statusFilter, activeTagIds });
	}

	return {
		get statusFilter() {
			return statusFilter;
		},
		set statusFilter(value: Settings['statusFilter']) {
			statusFilter = value;
			persist();
		},

		get activeTagIds(): string[] {
			return activeTagIds;
		},
		set activeTagIds(value: string[]) {
			activeTagIds = value;
			persist();
		},

		/** Persist current state (call after mutating activeTagIds in place). */
		persist
	};
}

export const settings = createSettings();
