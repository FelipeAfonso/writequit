import { createServerConvexClient } from '$lib/server/convex';
import { api } from '$convex/_generated/api';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	const client = createServerConvexClient(cookies);
	if (!client) return { preloaded: {} };

	try {
		const [boards, tags] = await Promise.all([
			client.query(api.boards.list),
			client.query(api.tags.list)
		]);

		return {
			preloaded: { boards, tags }
		};
	} catch {
		return { preloaded: {} };
	}
};
