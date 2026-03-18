import { createServerConvexClient } from '$lib/server/convex';
import { api } from '$convex/_generated/api';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, params }) => {
	const client = createServerConvexClient(cookies);
	if (!client) return { preloaded: {} };

	try {
		const [task, tags, settings, boardComments] = await Promise.all([
			client.query(api.tasks.get, { id: params.id as never }),
			client.query(api.tags.list),
			client.query(api.users.getSettings),
			client.query(api.boards.getCommentsByTask, {
				taskId: params.id as never
			})
		]);

		return {
			preloaded: { task, tags, settings, boardComments }
		};
	} catch {
		return { preloaded: {} };
	}
};
