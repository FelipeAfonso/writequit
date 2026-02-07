import { createServerConvexClient } from '$lib/server/convex';
import { api } from '$convex/_generated/api';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, params }) => {
	const client = createServerConvexClient(cookies);
	if (!client) return { preloaded: {} };

	try {
		const [session, tasks] = await Promise.all([
			client.query(api.sessions.get, {
				id: params.id as never
			}),
			client.query(api.tasks.list, {})
		]);

		return {
			preloaded: { session, tasks }
		};
	} catch {
		return { preloaded: {} };
	}
};
