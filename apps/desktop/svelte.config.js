import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			fallback: 'index.html'
		}),
		// Tauri expects a fixed port, fail if not available
		prerender: {
			entries: []
		}
	}
};

export default config;
