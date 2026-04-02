import { createServerConvexClient } from '$lib/server/convex';
import { api } from '$convex/_generated/api';
import type { PageServerLoad } from './$types';
import type { Id } from '$convex/_generated/dataModel';

export const load: PageServerLoad = async ({ cookies, params }) => {
	const client = createServerConvexClient(cookies);
	if (!client) return { preloaded: {}, boardId: params.id };

	try {
		const boardId = params.id as Id<'boards'>;

		// Core queries: board and tags are required for the page
		const [board, tags] = await Promise.all([
			client.query(api.boards.get, { id: boardId }),
			client.query(api.tags.list)
		]);

		// Ancillary queries: failures shouldn't block the page
		const [tasksResult, commentsResult, messagesResult] = await Promise.allSettled([
			client.query(api.boards.getTasks, { id: boardId }),
			client.query(api.boards.getComments, { boardId }),
			client.query(api.boards.getMessages, { boardId })
		]);

		return {
			preloaded: {
				board,
				tags,
				tasks: tasksResult.status === 'fulfilled' ? tasksResult.value : [],
				comments: commentsResult.status === 'fulfilled' ? commentsResult.value : [],
				messages: messagesResult.status === 'fulfilled' ? messagesResult.value : []
			},
			boardId: params.id
		};
	} catch (err) {
		console.error('Board preload failed:', err);
		return { preloaded: {}, boardId: params.id };
	}
};
