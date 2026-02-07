import { createServerConvexClient } from '$lib/server/convex';
import { api } from '$convex/_generated/api';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ cookies }) => {
	const client = createServerConvexClient(cookies);
	if (!client) return { preloaded: {} };

	try {
		const [settings, activeSession] = await Promise.all([
			client.query(api.users.getSettings),
			client.query(api.sessions.active)
		]);

		return {
			preloaded: { settings, activeSession }
		};
	} catch {
		// Token expired or invalid — fall back to client-side loading
		return { preloaded: {} };
	}
};
