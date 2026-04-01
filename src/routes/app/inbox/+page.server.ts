import { createServerConvexClient } from '$lib/server/convex';
import { api } from '$convex/_generated/api';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	const client = createServerConvexClient(cookies);
	if (!client) return { preloaded: {} };

	try {
		const notifications = await client.query(api.notifications.list);

		return {
			preloaded: { notifications }
		};
	} catch {
		return { preloaded: {} };
	}
};
