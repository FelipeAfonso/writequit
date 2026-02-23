# AGENTS.md - writequit

> writequit (:wq) - A minimal task manager, time tracker, and invoice generator for dev freelancers who don't like BS.

## Important Notes for Agents

1. **DO NOT run `dev` or `build` commands** - Assume the dev server and Convex dev are already running. Never start them yourself.

2. **DO NOT run `bunx convex` commands** - Never run Convex CLI commands (`bunx convex run`, `bunx convex deploy`, etc.) yourself. These can mutate production data or trigger deployments. Always ask the user to run them instead.

3. **After any major code changes**, always run validation in this order:

   ```bash
   bun run format              # First: auto-format code (root)
   ```

   Then use **parallel subagents** to run lint and type check simultaneously:

   ```bash
   bun run lint                # Subagent 1: check linting (root)
   bun run check               # Subagent 2: check types (in each package/app)
   ```

   Type check must be run in each workspace separately:

   ```bash
   bun run --filter @writequit/ui check
   bun run --filter @writequit/web check
   bun run --filter @writequit/desktop check
   ```

   Fix any errors before considering the task complete.

4. **Rebuild UI package after changes** - If you modify anything in `packages/ui/src/lib/`, rebuild the package before running type checks on apps that depend on it:
   ```bash
   bun run --filter @writequit/ui build   # svelte-kit sync && svelte-package
   ```

## Monorepo Structure

This is a **Bun workspace monorepo** with three packages:

```
writequit/
├── packages/
│   └── ui/                  # @writequit/ui — shared component library
├── apps/
│   ├── web/                 # @writequit/web — SvelteKit + Convex web app
│   └── desktop/             # @writequit/desktop — Tauri v2 desktop app
├── package.json             # Bun workspace root
├── tsconfig.base.json       # Shared TypeScript config
├── eslint.config.js         # Root ESLint config
├── .prettierrc              # Root Prettier config
└── AGENTS.md                # This file
```

### `packages/ui` — Shared UI Library (`@writequit/ui`)

Built with `svelte-package`. Contains all shared components, types, stores, utils, and the parser.

- **Types**: `src/lib/types/index.ts` — `Task`, `Session`, `Tag`, `Invoice`, `UserSettings`, etc.
- **DataProvider**: `src/lib/types/provider.ts` — `DataProvider` interface + all repository interfaces
- **Context**: `src/lib/types/context.ts` — `setDataProvider()` / `getDataProvider()` via Svelte context
- **Components**: `src/lib/components/` — `StatusLine`, `TaskEditor`, `TaskList`, `TaskCard`, `SessionCard`, `TagBadge`, `TagFilter`, `Tutorial`, `ConfirmDialog`, `Markdown`
- **Parser**: `src/lib/parser/` — Pure task parser (`parseTask(rawContent, tz, now?)`)
- **Stores**: `src/lib/stores/` — `commandPalette`, `settings`
- **Utils**: `src/lib/utils/` — `commands`, `datetime`, `keys`, `tags`, `invoicePdf`, `reportPdf`
- **Styles**: `src/lib/styles/theme.css` — Tokyo Night Tailwind v4 theme

Import patterns:

```typescript
// Barrel imports
import { parseTask, commandPalette, type Task } from '@writequit/ui';

// Component deep imports
import TaskEditor from '@writequit/ui/components/tasks/TaskEditor.svelte';
import StatusLine from '@writequit/ui/components/StatusLine.svelte';

// Styles
import '@writequit/ui/styles';
```

### `apps/web` — Web App (`@writequit/web`)

The original SvelteKit + Convex web app, deployed to Vercel.

- **Backend**: `convex/` — Convex functions (tasks, sessions, tags, invoices, users, admin)
- **Auth**: Convex Auth (OAuth)
- **Data access**: Direct Convex `useQuery`/`useMutation` calls (not yet migrated to DataProvider)
- **Note**: Still uses `$lib/` imports for its own components. Gradual migration to `@writequit/ui` is planned.

### `apps/desktop` — Desktop App (`@writequit/desktop`)

A Tauri v2 desktop app with SvelteKit (`adapter-static`) and local plain-text file storage.

- **Framework**: Tauri v2 (Rust backend, SvelteKit frontend)
- **Storage**: Plain-text files (hledger-inspired), XDG-compliant paths
  - Tasks: `~/.local/share/writequit/tasks/*.md` (YAML frontmatter + markdown body)
  - Sessions: `~/.local/share/writequit/sessions.ledger`
  - Tags: `~/.config/writequit/tags.yaml`
  - Settings: `~/.config/writequit/settings.yaml`
  - Invoices: `~/.local/share/writequit/invoices/*.yaml`
- **Data access**: `FileDataProvider` implements `DataProvider` via Tauri IPC (`invoke()`)
- **Auth**: None (single user, local data)
- **Rust backend**: `src-tauri/src/storage.rs` (StorageManager), `src-tauri/src/lib.rs` (IPC handlers)

## Project Overview

- **Stack**: SvelteKit 2 + Svelte 5, Convex backend (web), Tauri v2 (desktop), Tailwind CSS 4, TypeScript
- **Package Manager**: Bun (use `bun` instead of `npm`)
- **Deployment**: Web → Vercel via `@sveltejs/adapter-vercel`; Desktop → Tauri build
- **Design Philosophy**: Clean, minimal, terminal-like UI. Mono fonts, blocky elements. No shadcn or component libraries.

## Build/Lint/Test Commands

```bash
# Root commands (run from repo root)
bun run format              # Auto-format all files with Prettier
bun run lint                # Check formatting (Prettier) + linting (ESLint)

# UI package (packages/ui)
bun run --filter @writequit/ui build    # Build with svelte-package
bun run --filter @writequit/ui check    # Type check

# Web app (apps/web)
bun run --filter @writequit/web dev     # Start dev server
bun run --filter @writequit/web build   # Production build
bun run --filter @writequit/web check   # Type check

# Desktop app (apps/desktop)
bun run --filter @writequit/desktop dev       # Start SvelteKit dev server
bun run --filter @writequit/desktop tauri:dev  # Start Tauri dev (Rust + SvelteKit)
bun run --filter @writequit/desktop check     # Type check

# Or run check/build directly in each directory:
cd packages/ui && bun run check
cd apps/web && bun run check
cd apps/desktop && bun run check
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
- **Use `$lib/` alias** for imports from `src/lib/` within each app/package
- **Use `@writequit/ui`** for imports from the shared UI package

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

// 3. Shared UI package imports
import { parseTask, type Task } from '@writequit/ui';
import TaskEditor from '@writequit/ui/components/tasks/TaskEditor.svelte';

// 4. Local library imports ($lib)
import { someUtil } from '$lib/utils';
import Component from '$lib/components/Component.svelte';

// 5. Relative imports last
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

### DataProvider Pattern (shared components)

Components in `packages/ui` use a `DataProvider` abstraction instead of direct Convex calls. Each app provides its own implementation:

```typescript
// In packages/ui — components use:
import { getDataProvider } from '$lib/types/context.js';
const provider = getDataProvider();
const tasks = provider.tasks.list({ status: 'active' });
// tasks.current is the reactive value (Task[] | undefined)

// In apps/web — layout sets up ConvexDataProvider (planned)
// In apps/desktop — layout sets up FileDataProvider
import { setDataProvider } from '@writequit/ui';
setDataProvider(new FileDataProvider());
```

### Convex Backend Patterns (web app only)

```typescript
// apps/web/convex/tasks.ts
import { query, mutation } from './_generated/server';
import { v } from 'convex/values';

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
- Theme colors are defined in `packages/ui/src/lib/styles/theme.css`

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
writequit/
├── packages/ui/
│   └── src/lib/
│       ├── components/         # Shared Svelte components
│       │   ├── StatusLine.svelte
│       │   ├── Tutorial.svelte
│       │   ├── sessions/       # SessionCard
│       │   ├── tags/           # TagBadge, TagFilter
│       │   ├── tasks/          # TaskCard, TaskEditor, TaskList, TaskStatusBadge
│       │   └── ui/             # ConfirmDialog, Markdown, codemirror-theme
│       ├── parser/             # Pure task parser
│       ├── stores/             # commandPalette, settings
│       ├── styles/             # theme.css (Tailwind v4 theme)
│       ├── types/              # Shared types, DataProvider, context
│       └── utils/              # commands, datetime, keys, tags, invoicePdf, reportPdf
├── apps/web/
│   ├── convex/                 # Convex backend functions
│   │   ├── _generated/         # Auto-generated (DO NOT EDIT)
│   │   ├── schema.ts           # Database schema
│   │   ├── tasks.ts
│   │   ├── sessions.ts
│   │   ├── tags.ts
│   │   ├── invoices.ts
│   │   ├── users.ts
│   │   └── admin.ts
│   └── src/
│       ├── lib/
│       │   ├── auth/           # Convex auth helpers
│       │   ├── components/     # Web-app-specific component copies (being migrated)
│       │   ├── parser/         # Parser copy (kept for Convex bundler)
│       │   ├── stores/         # commandPalette, settings, usePaginatedQuery
│       │   └── utils/          # commands, datetime, keys, tags, preload, invoicePdf, reportPdf
│       └── routes/
│           ├── +layout.svelte  # Root layout (Convex client setup)
│           ├── +page.svelte    # Landing / auth redirect
│           └── app/            # Authenticated app routes
├── apps/desktop/
│   ├── src-tauri/
│   │   ├── src/
│   │   │   ├── main.rs         # Entry point
│   │   │   ├── lib.rs          # IPC command handlers
│   │   │   └── storage.rs      # StorageManager (XDG file I/O)
│   │   ├── Cargo.toml
│   │   ├── tauri.conf.json
│   │   └── icons/              # App icons
│   └── src/
│       ├── lib/data/
│       │   ├── formats.ts      # Plain-text file format parsers/serializers
│       │   └── provider.svelte.ts  # FileDataProvider (DataProvider impl)
│       └── routes/
│           ├── +layout.svelte  # Root layout (theme, DataProvider setup)
│           └── app/            # App routes (tasks, sessions, tags, reports, user)
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

Required in `apps/web/.env.local`:

```
PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
```

## Updating Command Palette & Keyboard Shortcuts

**IMPORTANT**: When adding new features, pages, or actions, always consider updating:

1. **Command palette commands** (`packages/ui/src/lib/utils/commands.ts`)
   - Add new commands for any new navigable page (`:pagename`)
   - Add action commands for significant user actions (`:new`, `:delete`, etc.)
   - Update `CommandContext` interface if the command needs page-specific actions
   - Each command needs: `name`, `aliases`, `description`, `args`, and `execute`

2. **Keyboard shortcuts help overlay** (in each app's `app/+layout.svelte`)
   - Add any new keyboard shortcut to the help overlay (`showHelp` section)
   - Keep shortcuts organized in sections: general, navigation, task list, task detail

3. **Page-specific command actions** (in each page's `+page.svelte`)
   - Register page-specific actions via `commandPalette.registerActions()` in a `$effect`
   - Clean up with `commandPalette.unregisterActions()` in the effect's return
   - Example: the tasks page registers `focusEditor` and `setSearch`

4. **Keep all three in sync** — if a shortcut exists, it should also be a command, and both should appear in the help overlay.

## Page Titles

**IMPORTANT**: Every page must have a `<svelte:head>` with a `<title>` element. Follow this pattern:

```svelte
<svelte:head>
	<title>pagename | :wq</title>
</svelte:head>
```

- **Static pages**: Use the page name (e.g., `tasks | :wq`, `sessions | :wq`)
- **Dynamic pages** (with `[id]` params): Use the entity's name/title with a fallback:
  ```svelte
  <svelte:head>
  	<title>{task.data?.title ?? 'task'} | :wq</title>
  </svelte:head>
  ```

Place `<svelte:head>` after the `</script>` tag and before any other markup.

## Key Dependencies

### Root / Shared

- `svelte@5.x` - Frontend framework (uses runes)
- `@sveltejs/kit@2.x` - App framework
- `tailwindcss@4.x` - Utility CSS framework

### Web App (`apps/web`)

- `convex@1.x` - Backend-as-a-service
- `convex-svelte` - Svelte bindings for Convex
- `@sveltejs/adapter-vercel` - Vercel deployment

### Desktop App (`apps/desktop`)

- `@tauri-apps/api@2.x` - Tauri frontend API
- `@tauri-apps/plugin-fs` - File system access
- `@sveltejs/adapter-static` - Static site generation for Tauri
- `js-yaml` - YAML parsing for config/data files

### UI Package (`packages/ui`)

- `svelte-package` - Build tool for Svelte component libraries
