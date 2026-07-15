# :wq — Screenshots

Captured from the real app running against a local Convex backend with demo data.
Clean (no browser chrome), dark theme, retina @2x.

## Sets

- **`./` (top level) — 1024×768 @2x → 2048×1536** — the compact set. App content fills
  the frame (the app caps content at 768px wide), so these stay legible when shown small.
  **This set feeds the landing page** (7 of them, as `static/screenshots/*.webp`).
- **`./1440x900/` — 1440×900 @2x → 2880×1800** — the original roomier set (more whitespace).

Each set has viewport-framed `*.png` plus full-page `fullpage/*.png` (where the screen scrolls).

## Index (same numbering in both sets)

| # | File | Screen / state | On landing? |
|---|------|----------------|:-:|
| 01 | `01-tasks-board` | **Main task board** (hero) — editor, status filters, tag chips, cards, running timer | ✅ |
| 02 | `02-task-editor-typing` | Task editor **live parsing** of `+tags` / `due:friday` | ✅ |
| 03 | `03-command-palette` | Vim-style **`:` command palette** | ✅ |
| 04 | `04-command-palette-start` | Palette mid-input (`start ` timer flow) | |
| 05 | `05-help-overlay` | Keyboard-shortcuts help (`?`) | |
| 06 | `06-task-detail` | Single task detail | |
| 07 | `07-inbox` | Notifications inbox (priority/comment/chat from a client board) | |
| 08 | `08-sessions` | Time-tracking sessions with active running timer | ✅ |
| 09 | `09-session-detail` | Single session detail | |
| 10 | `10-reports-sessions` | Reports → sessions (date range, grouped) | |
| 11 | `11-reports-invoices` | Reports → invoices (two draft invoices) | ✅ |
| 12 | `12-invoice-form` | New invoice form | |
| 13 | `13-boards` | Shared client boards list | |
| 14 | `14-board-detail` | Board management — share URL, password, tasks, chat | ✅ |
| 15 | `15-tags` | Tag management (priority/project/category/context) | |
| 16 | `16-user-settings` | User profile & settings | |
| 17 | `17-tasks-filtered` | Task board filtered by a tag | |
| 18 | `18-landing` | Marketing landing page (boot-sequence hero) | |
| 19 | `19-public-board-gate` | Public board password gate | |
| 20 | `20-public-board-unlocked` | Unlocked client board with live chat | ✅ |
| 21 | `21-public-board-comments` | Client board with a task comment thread expanded | |

Demo identity: *Felipe Afonso · felipe@writequit.dev*. All data is synthetic (clients
“Acme Corporation” / “Globex Industries”, collaborators “Sarah Chen” / “Marcus Lee”).
