# Canvas V5 Agent Notes

This repo is intentionally not a normal TanStack Start app. The main product goal is to build a Canvas LMS replacement UI that can run in two runtimes:

- a standalone web app for users with Canvas API-token/OAuth-style connections
- a browser extension that runs on authenticated Canvas pages and replaces the Canvas UI

The extension is not a temporary hack. Treat it as a first-class runtime.

## Big Picture

Canvas V5 is trying to share as much client app code as possible across the web app and extension. The shared client app lives in `packages/app`. The SDK and local-first data layer live in `packages/canvas-sdk`.

The web runtime and extension runtime differ mainly at the transport boundary:

- Web app: app auth is normal Better Auth against the web origin. Canvas data is fetched through app server routes using stored API/OAuth tokens.
- Extension: app auth is still Better Auth against the web origin, but app-server requests are routed through the extension background script. Canvas data is fetched directly from the Canvas page/session context.

Do not import web-only auth/client/server code directly into `packages/app`. Shared UI should talk to `@canvas-v5/canvas-sdk`.

## Shared Routes

Shared client routes live in:

- `packages/app/src/routes`

The shared route tree is generated into:

- `packages/app/src/routeTree.gen.ts`

The shared app router is created by:

- `packages/app/src/create-app-router.tsx`

The web app deliberately has a catchall route:

- `apps/web/src/routes/$.tsx`

That catchall renders the shared `CanvasApp`, so adding a normal shared client route should only require adding it under `packages/app/src/routes`. Do not add duplicate wrapper routes under `apps/web/src/routes` for every shared route.

Keep web-only routes in `apps/web/src/routes`, for example:

- `/login`
- `/api/*`
- auth/server-only TanStack Start routes

Exact web routes win before the catchall, so API and login routes are intentionally still in the web app.

## Runtime Entrypoints

Shared app runtime creation is in:

- `packages/app/src/canvas-app.tsx`

Web uses:

- `createWebCanvasRuntime()`
- `apps/web/src/canvas-runtime.ts` exports a singleton `canvasRuntime`

Use the singleton in web wrapper/root routes. Do not create a fresh web runtime for each web route; that causes hydration/sync churn.

Extension uses:

- `createExtensionCanvasRuntime(...)`
- `apps/extension/entrypoints/content.tsx`

The extension content script mounts the shared app into a Shadow DOM on Canvas pages. It also installs a lightweight bridge on the web app origin so the web app can detect whether the extension is installed.

## Auth Model

There are two separate auth concepts:

- App auth: Better Auth session for Canvas V5
- Canvas auth: either a Canvas browser session in the extension or a stored API/OAuth token in the web app

Shared UI should use SDK state:

```tsx
import { useCanvasRuntime, useCanvasSnapshot } from "@canvas-v5/canvas-sdk";

const runtime = useCanvasRuntime();
const { appAuth, canvasAuth } = useCanvasSnapshot();
```

For shared UI sign-in:

```tsx
await runtime.openAppLogin();
```

Do not use `authClient` inside `packages/app`. That is web-specific. The extension cannot use it directly in the same way.

As of now, there is no dedicated `useAppAuth()` hook. If adding one, implement it in `packages/canvas-sdk` as a wrapper around `useCanvasSnapshot().appAuth` and runtime methods. Keep the runtime abstraction intact.

For future sign-out work, add an SDK/runtime method such as `signOutApp()` instead of calling Better Auth directly from shared UI. It should work in both web and extension runtimes and clear local SDK data deliberately.

## Account And Connection Switching

Canvas connections are app-owned records stored on the server and synced locally. The local IndexedDB store has a normalized `connections` object store. The public snapshot still exposes them as `accounts` in some places for historical reasons.

Relevant SDK hooks:

- `useCanvasConnections()`
- `useCanvasAccounts()`
- `useActiveAccount()`
- `useCanvasAccountSwitcher()`

For custom account switching UI, prefer:

```tsx
const { accounts, activeAccount, switchAccount } = useCanvasAccountSwitcher();

await switchAccount(connectionId, {
  onError(error) {
    // show UI error
  },
});
```

Behavior:

- API-token/OAuth connections switch in-place and sync through the web server Canvas proxy.
- Canvas-session connections on web first ping the extension. If the extension is installed, the web app redirects to the Canvas base URL. If not installed, `onError` is called.
- Canvas-session connections in the extension are only usable on the relevant Canvas instance/page.

Important: Do not overwrite existing `canvas-session` connection labels with the Canvas profile name. The extension may auto-register a session connection after probing Canvas, but if the user already saved a label, that label must win.

## SDK And Data Flow

Core SDK files:

- `packages/canvas-sdk/src/runtime.tsx`
- `packages/canvas-sdk/src/store.ts`
- `packages/canvas-sdk/src/transports.ts`
- `packages/canvas-sdk/src/types.ts`

The runtime owns:

- active account/connection
- app auth state
- Canvas auth state
- IndexedDB hydration
- sync status
- optimistic mutation queue
- course overlay merging

The IndexedDB store currently includes:

- `connections`
- `courses`
- `enrollments`
- `assignments`
- `modules`
- `announcements`
- `submissions`
- `calendarItems`
- `courseOverlays`
- `syncScopes`
- `mutationQueue`

Canvas source data should be treated as Canvas-owned. App-owned overlays should be stored separately and merged by SDK selectors. For example, course icons come from `courseOverlays` and are exposed to UI as `course.app.icon`.

If adding new data:

1. Add the raw Canvas shape/type in `types.ts`.
2. Add a normalized IndexedDB store if needed.
3. Add sync logic in `runtime.tsx`.
4. Add hooks/selectors in `runtime.tsx`.
5. Keep transport-specific fetching behind `CanvasTransport` or `OverlayTransport`.

## Transports

Canvas transports:

- `CanvasRestTransport`: direct Canvas API calls, used by the extension with Canvas page/session credentials
- `WebCanvasProxyTransport`: web app proxy calls through `/api/canvas/request`
- `MockCanvasTransport`: local/mock fallback

Overlay transports:

- `HttpOverlayTransport`: web app server APIs
- Extension-specific overlay transport in `apps/extension/entrypoints/content.tsx`, which sends messages to the background script
- `LocalOverlayTransport`: mock/local fallback

The extension background script handles app-server fetches because content-script/web-page cookie behavior is unreliable for Better Auth. Do not move extension app-server requests back into direct page-context fetches without a very good reason.

## Web Server Routes

Important Canvas-related web routes:

- `apps/web/src/routes/api/canvas/connections.ts`
- `apps/web/src/routes/api/canvas/course-overlays.ts`
- `apps/web/src/routes/api/canvas/request.ts`

`/api/canvas/request` decrypts stored Canvas tokens server-side and proxies Canvas API calls. It only supports token-backed connections. Canvas browser-session connections are extension-only.

Stored Canvas tokens are encrypted via:

- `apps/web/src/lib/canvas-token.ts`

Database schema for Canvas connections/overlays:

- `packages/db/src/schema/canvas.ts`

If changing schema, remember that the user may need to run:

```bash
bun run db:push
```

or generate/apply migrations depending on the deployment plan.

## Extension Mounting

Extension content script:

- `apps/extension/entrypoints/content.tsx`

It does three special things:

1. On web app origins, it installs an extension-detection bridge and does not mount UI.
2. On Canvas origins, it verifies Canvas auth first.
3. If Canvas auth exists, it hides the Canvas UI and mounts the shared app in a Shadow DOM.

The extension should not nuke Canvas UI when Canvas auth is missing.

If app auth is missing, the shared app can still mount and show sign-in/dev UI. `runtime.openAppLogin()` opens the web app login from the extension.

## CSS And Tailwind In The Extension

The web app imports:

- `apps/web/src/index.css`

That currently imports:

- `@canvas-v5/ui/globals.css`

The shared app exports:

- `packages/app/src/styles.css`

The extension imports this as inline CSS:

```ts
import appStyles from "@canvas-v5/app/styles.css?inline";
```

WXT must run Tailwind too, otherwise the extension gets raw or incomplete CSS. `apps/extension/wxt.config.ts` intentionally includes `@tailwindcss/vite`.

Because the extension app is inside Shadow DOM, document-level selectors from the shared CSS need special handling:

- `:root` rules are rewritten to `:host`
- `.dark` rules are rewritten to `:host(.dark)`
- the shadow mount receives `background`, `foreground`, and `font-sans` variables

This is not a reset. It is adapting the same website CSS to Shadow DOM.

Do not reintroduce a big custom extension reset unless necessary. The current goal is: extension should render with the same CSS as the website.

Also keep Tailwind source scanning correct. `packages/ui/src/styles/globals.css` should include `packages/app/src/**/*.{ts,tsx}` so shared app classes are generated.

## Current Known Caveats

There are active/in-progress UI changes in `packages/app`, including sidebar/user-menu work. Type checks may currently fail because of unused imports or routes that do not exist yet. Do not “clean up” user work unless asked.

At the time this file was written, `packages/app/src/components/user-menu.tsx` was being built. For auth there, use the SDK runtime/snapshot, not `authClient`.

Some route typing issues may occur because the web app catchall route does not teach the web router about every shared app route. For links inside `packages/app`, prefer the shared app router context and generated route tree. If TypeScript sees the web router's route union instead, you may need to use the shared route types or avoid overly specific web-router `Link` types from the web route tree.

## Verification Commands

Useful targeted checks:

```bash
bun --filter @canvas-v5/canvas-sdk check-types
bun --filter @canvas-v5/app check-types
bun --filter extension compile
bun --filter extension build
bun --cwd apps/web tsc --noEmit
bun run build
```

Avoid running broad format/check commands casually when the user has in-progress edits. Prefer targeted `biome check --write <files>` only on files you touched.

## Working Rules For Future Agents

- Read the code before changing architecture.
- Keep `packages/app` runtime-agnostic.
- Keep Better Auth client/server details out of shared UI.
- Prefer SDK hooks over direct transport/auth/database calls from UI.
- Do not duplicate shared route wrappers in `apps/web/src/routes`; use the web catchall.
- Do not undo the extension background app-fetch bridge.
- Do not clobber user-defined Canvas connection labels.
- Preserve app-owned overlays as overlays, not mutations of Canvas source records.
- Be careful with dirty worktrees. Many files may be user-edited.
