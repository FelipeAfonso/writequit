import adapter from '@sveltejs/adapter-vercel';
import path from 'path';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter(),
		alias: {
			$convex: path.resolve('./convex'),
			'$convex/*': path.resolve('./convex/*')
		}
	}
};

export default config;
