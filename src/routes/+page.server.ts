import { JWT_COOKIE_NAME } from '$lib/auth';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	const token = cookies.get(JWT_COOKIE_NAME);
	return {
		isLoggedIn: !!token
	};
};
