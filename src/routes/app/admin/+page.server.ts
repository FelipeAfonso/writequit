import { createServerConvexClient } from '$lib/server/convex';
import { api } from '$convex/_generated/api';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	const client = createServerConvexClient(cookies);

	// No auth token — redirect to login
	if (!client) redirect(302, '/login');

	try {
		const isAdmin = await client.query(api.admin.isAdmin);

		// Not admin — redirect to app home
		if (!isAdmin) redirect(302, '/app');
	} catch {
		// Token expired or invalid — redirect to login
		redirect(302, '/login');
	}

	return {};
};
