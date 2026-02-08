import { createServerConvexClient } from '$lib/server/convex';
import { api } from '$convex/_generated/api';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, url }) => {
	const client = createServerConvexClient(cookies);
	const searchQuery = url.searchParams.get('q') || '';

	if (!client) {
		return { preloaded: {}, searchQuery, searchResults: null };
	}

	try {
		// Tasks are loaded client-side via usePaginatedQuery (cursor-based).
		// Only tags are preloaded server-side.
		const tags = await client.query(api.tags.list);

		// When a search query is present, fetch results server-side using
		// Convex full-text search. This avoids loading search results into
		// a reactive client subscription.
		let searchResults = null;
		if (searchQuery) {
			searchResults = await client.query(api.tasks.search, {
				query: searchQuery
			});
		}

		return {
			preloaded: { tags },
			searchQuery,
			searchResults
		};
	} catch (err) {
		console.error('SSR preload failed:', err);
		return { preloaded: {}, searchQuery, searchResults: null };
	}
};
