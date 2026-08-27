# canvas-v5

This project was created with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack that combines React, TanStack Start, Self, TRPC, and more.

## Features

- **TypeScript** - For type safety and improved developer experience
- **TanStack Start** - SSR framework with TanStack Router
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **Shared UI package** - shadcn/ui primitives live in `packages/ui`
- **tRPC** - End-to-end type-safe APIs
- **Drizzle** - TypeScript-first ORM
- **PostgreSQL** - Database engine
- **Authentication** - Better-Auth
- **Biome** - Linting and formatting
- **Turborepo** - Optimized monorepo build system

## Getting Started

First, install the dependencies:

```bash
bun install
```

## Database Setup

This project uses PostgreSQL with Drizzle ORM.

1. Make sure you have a PostgreSQL database set up.
2. Update your `apps/web/.env` file with your PostgreSQL connection details.

3. Apply the schema to your database:

```bash
bun run db:push
```

Then, run the development server:

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to see the fullstack application.

## UI Customization

React web apps in this stack share shadcn/ui primitives through `packages/ui`.

- Change design tokens and global styles in `packages/ui/src/styles/globals.css`
- Update shared primitives in `packages/ui/src/components/*`
- Adjust shadcn aliases or style config in `packages/ui/components.json` and `apps/web/components.json`

### Add more shared components

Run this from the project root to add more primitives to the shared UI package:

```bash
npx shadcn@latest add accordion dialog popover sheet table -c packages/ui
```

Import shared components like this:

```tsx
import { Button } from "@canvas-v5/ui/components/button";
```

### Add app-specific blocks

If you want to add app-specific blocks instead of shared primitives, run the shadcn CLI from `apps/web`.

## Git Hooks and Formatting

- Run checks: `bun run check`

## Project Structure

```
canvas-v5/
├── apps/
│   └── web/         # Fullstack application (React + TanStack Start)
├── packages/
│   ├── ui/          # Shared shadcn/ui components and styles
│   ├── api/         # API layer / business logic
│   ├── auth/        # Authentication configuration & logic
│   └── db/          # Database schema & queries
```

## Available Scripts

- `bun run dev`: Start all applications in development mode
- `bun run build`: Build all applications
- `bun run dev:web`: Start only the web application
- `bun run check-types`: Check TypeScript types across all apps
- `bun run db:push`: Push schema changes to database
- `bun run db:generate`: Generate database client/types
- `bun run db:migrate`: Run database migrations
- `bun run db:studio`: Open database studio UI
- `bun run check`: Run Biome formatting and linting

## Canvas Agent Access

Canvas V5 includes a Streamable HTTP MCP server at `/api/mcp`. It
uses the best available source for each logical Canvas account:

- OAuth or API-token credentials are fetched directly from the server.
- Browser-session credentials are synchronized by the extension service worker.
- Both paths use the same validation, normalization, content hashing, and cloud
  cache reconciliation code in `packages/canvas-core`.

After updating the checkout, apply the additive Drizzle schema. This now
includes the OAuth client, consent, token, and signing-key tables used by hosted
MCP clients:

```bash
bun run db:push
```

The extension runs a local sync every two hours. To wake suspended extension
workers when MCP data is stale, configure Web Push on the server and provide the
same public application origin when building the extension:

```dotenv
CANVAS_SYNC_VAPID_PUBLIC_KEY=...
CANVAS_SYNC_VAPID_PRIVATE_KEY=...
CANVAS_SYNC_VAPID_SUBJECT=mailto:you@example.com
VITE_CANVAS_V5_APP_ORIGIN=https://your-canvas-v5.example
```

The VAPID variables are optional during local development. Without them, alarms
and direct token refreshes still work, while on-demand session refreshes remain
queued until the extension next starts or polls.

For a cloud scheduler, call `/api/canvas/cron-sync` every two hours with:

```http
Authorization: Bearer <CANVAS_SYNC_CRON_SECRET>
```

`CANVAS_SYNC_CRON_SECRET` must be at least 24 characters. The scheduled route
refreshes token-backed accounts directly and queues extension jobs for
session-only accounts.

### Hosted ChatGPT and MCP Apps connection

Deploy the web app at a public HTTPS origin, then add this remote MCP server in
ChatGPT developer mode or another remote MCP client:

```text
URL: https://your-canvas-v5.example/api/mcp
Transport: Streamable HTTP
Authentication: OAuth
```

Canvas V5 publishes OAuth authorization-server and protected-resource metadata,
supports dynamic client registration with PKCE, and displays its own sign-in and
consent screens. The `canvas_show_upcoming_assignments` tool renders a bundled
MCP App with refresh, pagination, assignment links, host-controlled theming, and
system dark-mode fallback. The UI uses the standard MCP Apps bridge; ChatGPT
compatibility metadata is included without making the widget depend on
`window.openai`.

The same MCP URL can be used by Claude and other clients that support remote MCP
OAuth. Interactive UI travels with it only when the client implements MCP Apps;
clients without that extension can still call the normal data tools and receive
structured results.

To prepare an App Store submission, first deploy and test the production URL in
ChatGPT developer mode. Store review assets, privacy-policy URLs, and final tool
descriptions can then be prepared against that verified deployment.

### Personal bearer-token connection

Signed-in users can still open `/settings`, create an MCP bearer token, and
configure a local or personal MCP client with:

```text
URL: https://your-canvas-v5.example/api/mcp
Authorization: Bearer cv5_...
Transport: Streamable HTTP
```

MCP tokens are stored as SHA-256 hashes and are shown only once. The MCP tools
include account, course, assignment, assignment-detail, search, interactive
assignment overview, and explicit refresh operations. Canvas access tokens
remain encrypted server-side; browser session cookies are never uploaded.
