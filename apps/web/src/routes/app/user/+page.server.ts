import { createServerConvexClient } from '$lib/server/convex';
import { api } from '$convex/_generated/api';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	const client = createServerConvexClient(cookies);
	if (!client) return { preloaded: {} };

	try {
		const [user, settings] = await Promise.all([
			client.query(api.users.currentUser),
			client.query(api.users.getSettings)
		]);

		return {
			preloaded: { user, settings }
		};
	} catch {
		return { preloaded: {} };
	}
};
