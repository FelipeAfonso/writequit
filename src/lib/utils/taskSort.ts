/** Minimal task shape required by the sort comparator. */
export interface TaskSortFields {
	status: string;
	tagIds: string[];
	dueDate?: number;
	createdAt: number;
	completedAt?: number;
}

/** Status sort order: active < inbox < done. */
const STATUS_ORDER: Record<string, number> = { active: 0, inbox: 1, done: 2 };

/**
 * Extract numeric priority from a task's priority tags (p0->0, p1->1, ...).
 * Returns Infinity when no priority tag is found (sorts last).
 */
export function getPriorityOrder(
	tagIds: string[],
	getTag: (id: string) => { name: string; type?: string } | undefined
): number {
	for (const id of tagIds) {
		const tag = getTag(id);
		if (tag?.type === 'priority') {
			const num = parseInt(tag.name.replace(/\D/g, ''), 10);
			if (!isNaN(num)) return num;
		}
	}
	return Infinity;
}

/**
 * Compare two tasks for sorting:
 *   1. Status group (active < inbox < done)
 *   2. Done tasks: most recently completed first (completedAt DESC)
 *   3. Active/inbox: priority tag (p0 < p1 < ... < no tag)
 *   4. Due date (earliest first, no date last)
 *   5. Newest first (createdAt DESC)
 */
export function compareTasks(
	a: TaskSortFields,
	b: TaskSortFields,
	getTag: (id: string) => { name: string; type?: string } | undefined
): number {
	// 1. Status group
	const statusDiff = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
	if (statusDiff !== 0) return statusDiff;

	// 2. Done tasks: most recently completed first
	if (a.status === 'done') {
		return (b.completedAt ?? b.createdAt) - (a.completedAt ?? a.createdAt);
	}

	// 3. Priority tag
	const priDiff = getPriorityOrder(a.tagIds, getTag) - getPriorityOrder(b.tagIds, getTag);
	if (priDiff !== 0) return priDiff;

	// 4. Due date (earliest first, no date last)
	const aDue = a.dueDate ?? Infinity;
	const bDue = b.dueDate ?? Infinity;
	if (aDue !== bDue) return aDue - bDue;

	// 5. Newest first
	return b.createdAt - a.createdAt;
}
