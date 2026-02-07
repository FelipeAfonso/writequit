/**
 * Context keys for passing SSR-preloaded data to components
 * that aren't directly connected to SvelteKit page data.
 */

/** Context key for the preloaded active session (used by StatusBar). */
export const PRELOADED_ACTIVE_SESSION_CTX = '$$_preloadedActiveSession';
