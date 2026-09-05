# Canvas V5

A replacement interface for Canvas LMS, available as a standalone web app and a
browser extension. Both runtimes share the same React app and SDK: the web app
uses a saved Canvas connection, while the extension works with your existing
Canvas browser session.

[Open the web app](https://canvas.maxw.app) ·
[Download the extension](https://github.com/maxwiseman/canvas-v5/releases/latest) ·
[Changelog](changelog/)

## Features

- Browse courses, assignments, modules, pages, files, announcements, discussions,
  and quizzes, with global search and previous/next course navigation.
- Preview course files in place, including PDFs and Office documents.
- Track upcoming work in the planner and calendar. View Canvas course totals,
  assignment grades, and instructor feedback with attachments.
- Write text submissions in a spacious Plate rich-text editor with headings,
  lists, links, text and highlight colors, images, and inline/block code.
- Save text drafts to Canvas's native draft storage and an account-scoped local
  IndexedDB store. Restore drafts later, retry offline saves, and resolve
  conflicts with drafts changed elsewhere.
- Submit files and website URLs, with file validation and upload retry support.
  Media recording, annotation, quizzes, discussions, and external tools use
  explicit Canvas entry points where native tools are needed.
- Switch between Canvas connections, use light or dark mode, and access Canvas
  data through a hosted MCP server with interactive previews.

Native draft storage is shared with Canvas. Mobile-app draft interoperability
has not yet been verified.

## Install the extension

Download the Chrome or Firefox ZIP from the
[latest GitHub Release](https://github.com/maxwiseman/canvas-v5/releases/latest).
Release assets also include a source archive. Releases are distributed through
GitHub; publishing a release does not submit it to browser extension stores.

For Chrome, unzip the Chrome package, enable Developer mode at
`chrome://extensions`, and choose **Load unpacked** with the extracted folder.
For Firefox development, unzip the Firefox package and load its `manifest.json`
as a temporary add-on at `about:debugging#/runtime/this-firefox`.

Sign in to Canvas normally, then open a Canvas page. The extension mounts the
shared interface after checking the Canvas session. A native Canvas fallback is
available for workflows that need the original interface.

## Architecture

| Package | Responsibility |
| --- | --- |
| `apps/web` | TanStack Start host, app authentication, Canvas token proxy, and MCP endpoints |
| `apps/extension` | WXT extension, Canvas page mounting, and background sync/auth bridge |
| `packages/app` | Shared routes and product UI used by both runtimes |
| `packages/canvas-sdk` | Runtime state, transports, IndexedDB cache, drafts, and React hooks |
| `packages/canvas-core` | Shared Canvas validation, normalization, and cache reconciliation |
| `packages/canvas-mcp-app` | Interactive MCP App views |
| `packages/ui` | Shared shadcn components, styles, and design tokens |
| `packages/api`, `packages/auth`, `packages/db` | Server APIs, Better Auth, and Drizzle database schema |
| `packages/env`, `packages/config` | Environment validation and shared tooling configuration |

The web app's catchall route hosts the shared router. Product routes belong in
`packages/app/src/routes`; web-only API and authentication routes belong in
`apps/web/src/routes`. Shared UI talks to SDK hooks rather than importing
web-only authentication or database code.

The stack uses TypeScript, React, TanStack Start/Router, Tailwind CSS, shadcn,
Plate, Better Auth, Drizzle, PostgreSQL, Bun, and Turborepo. It was originally
scaffolded with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack).

## Local development

Use Bun 1.3.11 and a PostgreSQL database compatible with the project's
`@neondatabase/serverless` driver, such as Neon.

1. Install dependencies from the repository root:

   ```bash
   bun install
   ```

2. Create `apps/web/.env` with your development configuration:

   ```dotenv
   DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE
   BETTER_AUTH_SECRET=replace-with-a-random-secret-at-least-32-characters-long
   BETTER_AUTH_URL=http://localhost:3000
   CORS_ORIGIN=http://localhost:3000
   ```

3. Apply the schema and start the web app:

   ```bash
   bun run db:push
   bun run dev:web
   ```

Open [localhost:3000](http://localhost:3000). Connect a Canvas account in the app;
browser-session connections require the extension.

To develop the extension against the local web app, run this in another terminal:

```bash
VITE_CANVAS_V5_APP_ORIGIN=http://localhost:3000 bun --filter extension dev
```

Use `bun --filter extension dev:firefox` for Firefox, with the same origin
variable when using a local backend. The default extension app origin is
`https://canvas.maxw.app`.

## Development commands

| Command | Purpose |
| --- | --- |
| `bun run dev` | Start workspace development tasks |
| `bun run dev:web` | Start the web app on port 3000 |
| `bun run build` | Build the web app, extension, and MCP App |
| `bun --filter @canvas-v5/app check-types` | Check the shared UI |
| `bun --filter @canvas-v5/canvas-sdk check-types` | Check the SDK |
| `bun --filter extension compile` | Check extension types |
| `bun --cwd apps/web tsc --noEmit` | Check web app types |
| `bun test packages/app/tests packages/canvas-sdk/tests` | Run UI utility and SDK tests |
| `bun --filter extension zip` | Package Chrome |
| `bun --filter extension zip:firefox` | Package Firefox and extension sources |
| `bun run db:push` | Apply the current schema directly |
| `bun run db:generate` | Generate SQL migrations |
| `bun run db:migrate` | Apply migrations |
| `bun run db:studio` | Open Drizzle Studio |
| `bun run check` | Run Biome with formatting and lint fixes |

UI primitives live in `packages/ui/src/components`; shared styles and design
tokens live in `packages/ui/src/styles/globals.css`. Import primitives through
`@canvas-v5/ui/components/*`.

## Releases

Completed changes get a Markdown fragment in `changelog/unreleased/`. A release
rolls its included fragments into `changelog/vX.Y.Z.md` and tags the release
commit. Publishing the GitHub Release triggers
[the extension release workflow](.github/workflows/extension-release.yml), which
builds Chrome and Firefox packages using the tag's version and uploads the ZIPs.

See [AGENTS.md](AGENTS.md) for runtime boundaries, contribution notes, and the
full release procedure.

## Canvas Agent Access

Canvas V5 includes a Streamable HTTP MCP server at `/api/mcp`. It
uses the best available source for each logical Canvas account:

- Data for OAuth or API-token connections is fetched directly by the server.
- Data for browser-session connections is synchronized by the extension service worker.
- Both paths use the same validation, normalization, content hashing, and cloud
  cache reconciliation code in `packages/canvas-core`.

Apply the database schema when setting up or updating a deployment. It includes
the OAuth client, consent, token, and signing-key tables used by hosted MCP clients:

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
consent screens. The MCP tools provide interactive assignment lists, assignment
and resource previews, and a calendar of assignment due dates and Canvas events.
The bundled MCP App supports host-controlled theming and system dark-mode
fallback. The UI uses the standard MCP Apps bridge; ChatGPT compatibility
metadata is included without making the widget depend on
`window.openai`.

The same MCP URL can be used by Claude and other clients that support remote MCP
OAuth. Interactive UI travels with it only when the client implements MCP Apps;
clients without that extension can still call the normal data tools and receive
structured results.

### Personal bearer-token connection

Signed-in users can still open `/settings`, create an MCP bearer token, and
configure a local or personal MCP client with:

```text
URL: https://your-canvas-v5.example/api/mcp
Authorization: Bearer cv5_...
Transport: Streamable HTTP
```

MCP tokens are stored as SHA-256 hashes and are shown only once. The MCP tools
include account, course, assignment, resource, search, calendar, interactive
preview, and explicit refresh operations. Canvas access tokens remain encrypted
server-side; browser session cookies are never uploaded.
