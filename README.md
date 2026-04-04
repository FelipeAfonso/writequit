# :wq (writequit)

A no-BS task manager, time tracker, and invoice generator built for freelance developers.

Terminal-style interface. Vim keybindings. Markdown tasks. No fluff.

## Features

- **Task Management** - Create and organize tasks with markdown, inline tags (`+project`), due dates, and priority levels
- **Time Tracking** - Start/stop work sessions and associate them with tasks automatically via shared tags
- **Invoice Generation** - Generate PDF invoices from tracked sessions with customizable rates, currency, and line items
- **Shared Boards** - Create password-protected public boards to share task lists with clients or collaborators
- **Vim Keybindings** - Full vim mode powered by CodeMirror, with a command palette (`:command` style)
- **Reports** - Generate time reports and project summaries from your session data

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | SvelteKit 5 + Svelte 5 (runes) |
| Styling | Tailwind CSS 4 |
| Backend | [Convex](https://convex.dev) (real-time BaaS) |
| Editor | CodeMirror 6 (with Vim mode) |
| Auth | [WorkOS](https://workos.com) AuthKit |
| PDF | jsPDF |
| Markdown | marked + shiki |
| Deployment | Vercel |

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) (package manager)
- A [Convex](https://convex.dev) account (free tier available)
- A [WorkOS](https://workos.com) account for authentication

### Setup

1. Clone the repo:

```sh
git clone https://github.com/FelipeAfonso/writequit.git
cd writequit
```

2. Install dependencies:

```sh
bun install
```

3. Create a `.env.local` file with your environment variables:

```sh
PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
PUBLIC_WORKOS_CLIENT_ID=your_workos_client_id
```

4. Set up Convex environment variables (in the Convex dashboard):

```
WORKOS_CLIENT_ID=your_workos_client_id
```

5. Generate JWT keys for auth (and add the output to your Convex env vars):

```sh
bun run generateKeys.mjs
```

6. Start the development servers:

```sh
# In one terminal
bun run convex

# In another terminal
bun run dev
```

The app will be available at `http://localhost:1337`.

## Project Structure

```
src/
  lib/
    auth/          # WorkOS authentication adapter
    components/    # Svelte components (tasks, sessions, tags, UI)
    parser/        # Markdown task parser (extracts title, tags, due dates)
    stores/        # Svelte state (command palette, settings)
    utils/         # Helpers (PDF generation, sorting, datetime)
  routes/
    (app)/         # Authenticated app pages
    board/[slug]/  # Public shared boards
    callback/      # Auth callback
convex/            # Backend functions (schema, queries, mutations)
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
