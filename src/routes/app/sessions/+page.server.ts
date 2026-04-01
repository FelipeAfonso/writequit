import { createServerConvexClient } from '$lib/server/convex';
import { api } from '$convex/_generated/api';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	const client = createServerConvexClient(cookies);
	if (!client) return { preloaded: {} };

	try {
		const [sessions, tags, activeSession] = await Promise.all([
			// Default: fetch with no date filter (same as 'week' default,
			// but we can't compute the timezone-aware range on the server
			// without knowing the user's timezone. Fetch all and let the
			// client re-subscribe with the correct date range args.)
			client.query(api.sessions.list, {}),
			client.query(api.tags.list),
			client.query(api.sessions.active)
		]);

		return {
			preloaded: { sessions, tags, activeSession }
		};
	} catch {
		return { preloaded: {} };
	}
};
