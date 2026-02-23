/**
 * Svelte context helpers for the DataProvider.
 *
 * Each app (web / desktop) calls `setDataProvider()` in its root layout.
 * Shared components call `getDataProvider()` to access it.
 */

import { getContext, setContext } from 'svelte';
import type { DataProvider } from './provider.js';

const DATA_PROVIDER_KEY = Symbol('writequit:data-provider');

export function setDataProvider(provider: DataProvider): void {
	setContext(DATA_PROVIDER_KEY, provider);
}

export function getDataProvider(): DataProvider {
	const provider = getContext<DataProvider>(DATA_PROVIDER_KEY);
	if (!provider) {
		throw new Error(
			'DataProvider not found in context. ' +
				'Call setDataProvider() in your root layout.'
		);
	}
	return provider;
}
