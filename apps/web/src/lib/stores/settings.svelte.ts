/**
 * Persistent user settings backed by localStorage.
 *
 * All settings live under a single `wq:settings` key as JSON.
 * Reactive via Svelte 5 runes — reads/writes are fine-grained.
 * SSR-safe: falls back to defaults when localStorage is unavailable.
 *
 * Server-side user settings (from Convex) control the *defaults*
 * applied on page load.  The `applyServerDefaults` function resets
 * the filters to the server-defined defaults unless the setting is
 * "lastUsed", in which case the localStorage value is preserved.
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

export interface ServerDefaults {
	defaultStatusFilter: 'lastUsed' | 'all' | 'inbox' | 'active' | 'done';
	defaultTagFilter: 'lastUsed' | 'all';
}

function createSettings() {
	const initial = load();

	let statusFilter = $state<Settings['statusFilter']>(initial.statusFilter);
	let activeTagIds = $state<string[]>(initial.activeTagIds);
	let _defaultsApplied = $state(false);

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
		persist,

		/**
		 * Apply server-side defaults once per session.
		 *
		 * - If `defaultStatusFilter` is not "lastUsed", override the current
		 *   status filter with that value.
		 * - If `defaultTagFilter` is "all", reset activeTagIds to [].
		 * - Only runs once — subsequent calls are no-ops.
		 */
		applyServerDefaults(defaults: ServerDefaults) {
			if (_defaultsApplied) return;
			_defaultsApplied = true;

			if (defaults.defaultStatusFilter !== 'lastUsed') {
				statusFilter = defaults.defaultStatusFilter;
				persist();
			}
			if (defaults.defaultTagFilter === 'all') {
				activeTagIds = [];
				persist();
			}
		}
	};
}

export const settings = createSettings();
