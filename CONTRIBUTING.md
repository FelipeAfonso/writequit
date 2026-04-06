# Contributing to writequit

Thanks for your interest in contributing to writequit! Here's how to get started.

## Development Setup

1. Fork and clone the repository
2. Follow the [Getting Started](README.md#getting-started) guide to set up your local environment
3. Create a feature branch from `dev`:

```sh
git checkout -b feat/your-feature dev
```

## Code Style

- **Formatting**: We use Prettier with tabs, single quotes, and 80-char line width. Run `bun run format` before committing.
- **Linting**: Run `bun run lint` to check for issues.
- **Type checking**: Run `bun run check` to verify TypeScript types.

## Guidelines

### Do

- Write clean, readable code that follows existing patterns
- Keep PRs focused on a single change
- Test your changes locally before submitting
- Update the command palette (`src/lib/utils/commands.ts`) when adding new pages or actions
- Update keyboard shortcuts help overlay when adding new shortcuts

### Don't

- Modify auto-generated files in `convex/_generated/`
- Commit `.env` files or secrets
- Add unnecessary dependencies

## Pull Requests

1. Base your PR against the `dev` branch
2. Provide a clear description of what your change does and why
3. Make sure `bun run lint` and `bun run check` pass
4. Keep commits clean and descriptive

## Reporting Issues

- Use GitHub Issues to report bugs or request features
- Include steps to reproduce for bug reports
- Check existing issues before creating a new one

## Architecture Notes

- **Convex** handles all backend logic (queries, mutations, auth). Functions live in `convex/`.
- **SvelteKit** handles routing, SSR, and the frontend. Pages live in `src/routes/`.
- **Tasks** are stored as raw markdown and parsed client-side for title, tags, and due dates.
- **Sessions** track time and can auto-link to tasks via shared tags.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
