import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	// Prevent vite from obscuring Tauri errors
	clearScreen: false,
	server: {
		port: 1338,
		strictPort: true
	},
	// Tauri expects a fixed port
	envPrefix: ['VITE_', 'TAURI_']
});
