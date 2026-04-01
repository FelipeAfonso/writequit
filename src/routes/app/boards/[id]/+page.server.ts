import { createServerConvexClient } from '$lib/server/convex';
import { api } from '$convex/_generated/api';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, params }) => {
	const client = createServerConvexClient(cookies);
	if (!client) return { preloaded: {}, boardId: params.id };

	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const boardId = params.id as any;
		const [board, tags, tasks, comments, messages] = await Promise.all([
			client.query(api.boards.get, { id: boardId }),
			client.query(api.tags.list),
			client.query(api.boards.getTasks, { id: boardId }),
			client.query(api.boards.getComments, { boardId }),
			client.query(api.boards.getMessages, { boardId })
		]);

		return {
			preloaded: { board, tags, tasks, comments, messages },
			boardId: params.id
		};
	} catch {
		return { preloaded: {}, boardId: params.id };
	}
};
