/**
 * Tag sorting utilities.
 *
 * Canonical type order: priority > project > category > context > (none)
 */

const TYPE_ORDER: Record<string, number> = {
	priority: 0,
	project: 1,
	category: 2,
	context: 3
};

const NO_TYPE = 4;

/** Sort tags by type (priority > project > category > context > none), then alphabetically by name. */
export function sortTags<T extends { name: string; type?: string }>(
	tags: T[]
): T[] {
	return [...tags].sort((a, b) => {
		const typeA = a.type ? (TYPE_ORDER[a.type] ?? NO_TYPE) : NO_TYPE;
		const typeB = b.type ? (TYPE_ORDER[b.type] ?? NO_TYPE) : NO_TYPE;
		if (typeA !== typeB) return typeA - typeB;
		return a.name.localeCompare(b.name);
	});
}
