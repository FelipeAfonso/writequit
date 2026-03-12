import { createServerConvexClient } from '$lib/server/convex';
import { api } from '$convex/_generated/api';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, params }) => {
	const client = createServerConvexClient(cookies);
	if (!client) return { preloaded: {}, boardId: params.id };

	try {
		const [board, tags] = await Promise.all([
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			client.query(api.boards.get, { id: params.id as any }),
			client.query(api.tags.list)
		]);

		return {
			preloaded: { board, tags },
			boardId: params.id
		};
	} catch {
		return { preloaded: {}, boardId: params.id };
	}
};
