import { createServerConvexClient } from '$lib/server/convex';
import { api } from '$convex/_generated/api';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, url }) => {
	const client = createServerConvexClient(cookies);
	const searchQuery = url.searchParams.get('q') || '';

	if (!client) {
		return {
			preloaded: { tags: undefined, tasks: undefined },
			searchQuery,
			searchResults: null
		};
	}

	try {
		// Preload tags and the first page of tasks in parallel.
		// Tasks are preloaded with no status filter ("all" view) since the
		// user's active filter lives in localStorage and isn't available
		// server-side. Once the client-side paginated subscription connects,
		// it takes over with the correct filter.
		const [tags, tasksPage] = await Promise.all([
			client.query(api.tags.list),
			client.query(api.tasks.listPaginated, {
				paginationOpts: { numItems: 10, cursor: null, id: 0 }
			})
		]);

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
			preloaded: { tags, tasks: tasksPage.page },
			searchQuery,
			searchResults
		};
	} catch (err) {
		console.error('SSR preload failed:', err);
		return {
			preloaded: { tags: undefined, tasks: undefined },
			searchQuery,
			searchResults: null
		};
	}
};
