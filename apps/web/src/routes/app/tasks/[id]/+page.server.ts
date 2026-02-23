import { createServerConvexClient } from '$lib/server/convex';
import { api } from '$convex/_generated/api';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, params }) => {
	const client = createServerConvexClient(cookies);
	if (!client) return { preloaded: {} };

	try {
		const task = await client.query(api.tasks.get, {
			id: params.id as never
		});

		return {
			preloaded: { task }
		};
	} catch {
		return { preloaded: {} };
	}
};
