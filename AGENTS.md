# AGENTS.md - writequit

> writequit (:wq) - A minimal task manager, time tracker, and invoice generator for dev freelancers who don't like BS.

## Important Notes for Agents

1. **DO NOT run `dev` or `build` commands** - Assume the dev server (`bun run dev`) and Convex dev (`bunx convex dev`) are already running. Never start them yourself.

2. **After any major code changes**, always run validation in this order:
   ```bash
   bun run format              # First: auto-format code
   ```
   Then use **parallel subagents** to run lint and type check simultaneously:
   ```bash
   bun run lint                # Subagent 1: check linting
   bun run check               # Subagent 2: check types
   ```
   Fix any errors before considering the task complete.

## Project Overview

- **Stack**: SvelteKit 2 + Svelte 5, Convex backend, Tailwind CSS 4, TypeScript
- **Package Manager**: Bun (use `bun` instead of `npm`)
- **Deployment**: Vercel via `@sveltejs/adapter-vercel`
- **Design Philosophy**: Clean, minimal, terminal-like UI. Mono fonts, blocky elements. No shadcn or component libraries.

## Build/Lint/Test Commands

```bash
# Development
bun run dev              # Start dev server (Vite)

# Build & Preview
bun run build            # Production build
bun run preview          # Preview production build

# Type Checking
bun run check            # Run svelte-check once
bun run check:watch      # Run svelte-check in watch mode

# Linting & Formatting
bun run lint             # Check formatting (Prettier) + linting (ESLint)
bun run format           # Auto-format all files with Prettier

# Convex
bunx convex dev          # Start Convex dev server (syncs functions)
bunx convex deploy       # Deploy Convex functions to production
bunx convex functions    # List all Convex functions
```

### No Testing Framework Yet

Testing is not configured. When adding tests, use Vitest (SvelteKit's recommended test runner):

```bash
bun add -D vitest @testing-library/svelte
```

## Code Style Guidelines

### Formatting (Prettier)

- **Indentation**: Tabs (not spaces)
- **Quotes**: Single quotes (`'`)
- **Trailing Commas**: None
- **Print Width**: 80 characters
- **HTML Whitespace**: Ignore

### TypeScript

- **Strict mode enabled** - all code must be properly typed
- **checkJs enabled** - JavaScript files are type-checked too
- **No `any`** - prefer `unknown` or proper types
- **Use `$lib/` alias** for imports from `src/lib/`

### Svelte 5 Patterns

This project uses **Svelte 5 runes**. Do NOT use Svelte 4 patterns.

```svelte
<!-- CORRECT: Svelte 5 -->
<script lang="ts">
	let { data, children } = $props();
	let count = $state(0);
	let doubled = $derived(count * 2);
</script>

{@render children()}

<!-- WRONG: Svelte 4 (do NOT use) -->
<script>
	export let data;  // NO
	let count = 0;    // NO - use $state()
	$: doubled = count * 2;  // NO - use $derived()
</script>

<slot />  <!-- NO - use {@render children()} -->
```

### Import Conventions

```typescript
// 1. Svelte/SvelteKit imports first
import { page } from '$app/state';
import { goto } from '$app/navigation';

// 2. Environment variables
import { PUBLIC_CONVEX_URL } from '$env/static/public';

// 3. Library imports ($lib)
import { someUtil } from '$lib/utils';
import Component from '$lib/components/Component.svelte';

// 4. Relative imports last
import './styles.css';
```

### Naming Conventions

| Type                | Convention         | Example                                |
| ------------------- | ------------------ | -------------------------------------- |
| Components          | PascalCase         | `TaskList.svelte`                      |
| Routes/pages        | kebab-case folders | `src/routes/time-tracker/+page.svelte` |
| TypeScript files    | camelCase          | `utils.ts`, `timeHelpers.ts`           |
| Convex functions    | camelCase          | `convex/tasks.ts`                      |
| Variables/functions | camelCase          | `const taskList`, `function getTask()` |
| Types/Interfaces    | PascalCase         | `type Task`, `interface Invoice`       |
| Constants           | SCREAMING_SNAKE    | `const MAX_TASKS = 100`                |

### Convex Backend Patterns

```typescript
// convex/tasks.ts
import { query, mutation } from './_generated/server';
import { v } from 'convex/values';

// Always define validators for args
export const list = query({
	args: { projectId: v.optional(v.id('projects')) },
	handler: async (ctx, args) => {
		return await ctx.db.query('tasks').collect();
	}
});

export const create = mutation({
	args: {
		title: v.string(),
		projectId: v.id('projects')
	},
	handler: async (ctx, args) => {
		return await ctx.db.insert('tasks', {
			...args,
			createdAt: Date.now()
		});
	}
});
```

Using Convex in Svelte:

```svelte
<script lang="ts">
	import { useQuery, useMutation } from 'convex-svelte';
	import { api } from '$lib/convex/_generated/api';

	const tasks = useQuery(api.tasks.list, {});
	const createTask = useMutation(api.tasks.create);
</script>
```

### Error Handling

```typescript
// Use try/catch with specific error types
try {
	await createTask({ title, projectId });
} catch (error) {
	if (error instanceof ConvexError) {
		// Handle Convex-specific errors
	}
	console.error('Failed to create task:', error);
}
```

### CSS/Tailwind Guidelines

- Use Tailwind utility classes for styling
- Design should feel terminal-like: mono fonts, sharp corners, minimal color
- Prefer `font-mono` for most text
- Use high contrast colors (think terminal: dark bg, bright text)
- No rounded corners (`rounded-none` or just don't add rounding)
- Borders should be visible and blocky

```svelte
<!-- Example: Terminal-like button -->
<button
	class="border border-green-500 bg-black px-4 py-2 font-mono text-green-500 hover:bg-green-500 hover:text-black"
>
	:wq
</button>
```

## File Structure

```
src/
├── lib/
│   ├── components/     # Reusable Svelte components
│   ├── stores/         # Svelte stores (if needed)
│   ├── utils/          # Utility functions
│   └── assets/         # Static assets (images, icons)
├── routes/
│   ├── +layout.svelte  # Root layout (Convex setup)
│   ├── +page.svelte    # Home page
│   └── [feature]/      # Feature routes
convex/
├── _generated/         # Auto-generated (DO NOT EDIT)
├── schema.ts           # Database schema
└── [feature].ts        # Convex functions by feature
```

## MCP Tools (for AI Agents)

### Svelte MCP Server

1. **list-sections** - ALWAYS call first to discover Svelte/SvelteKit docs
2. **get-documentation** - Fetch specific documentation sections
3. **svelte-autofixer** - MUST use before sending any Svelte code. Keep calling until no issues.
4. **playground-link** - Generate playground links (ask user first, never if code written to files)

### Convex MCP Server

Use `mcp_convex_*` tools to interact with the Convex deployment:

- `mcp_convex_status` - Get deployment info
- `mcp_convex_tables` - List database tables and schema
- `mcp_convex_data` - Read data from tables
- `mcp_convex_run` - Execute Convex functions
- `mcp_convex_logs` - View function logs

## Environment Variables

Required in `.env.local`:

```
PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
```

## Key Dependencies

- `svelte@5.x` - Frontend framework (uses runes)
- `@sveltejs/kit@2.x` - App framework
- `convex@1.x` - Backend-as-a-service
- `convex-svelte` - Svelte bindings for Convex
- `tailwindcss@4.x` - Utility CSS framework
