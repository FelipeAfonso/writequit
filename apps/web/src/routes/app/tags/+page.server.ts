import { createServerConvexClient } from '$lib/server/convex';
import { api } from '$convex/_generated/api';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	const client = createServerConvexClient(cookies);
	if (!client) return { preloaded: {} };

	try {
		const tags = await client.query(api.tags.list);

		return {
			preloaded: { tags }
		};
	} catch {
		return { preloaded: {} };
	}
};
