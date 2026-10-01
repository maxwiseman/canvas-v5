# Canvas V5 inside ChatGPT

The ChatGPT plugin embeds the existing `CanvasApp` from `packages/app`, including its route tree, sidebar, course views, assignment and submission views, and stylesheet. There is no separate ChatGPT dashboard or duplicated course UI.

`packages/canvas-mcp-app/src/canvas-app.tsx` is the host adapter. It connects to the MCP Apps bridge, receives the initial authenticated bootstrap, boots a Canvas SDK runtime, and mounts `CanvasApp`. Memory history keeps navigation inside the embedded app. Host theme and `openai/deepLink` updates are forwarded to the shared frontend. External links use the host's `openLink` API.

The MCP server exposes:

- `canvas_open_app`: global sidebar and conversation-panel entrypoints, with a fullscreen UI resource (`ui://canvas-v5/app-v1.html`).
- `canvas_app_read`: app-only Canvas API reads, scoped to the authenticated user and selected connection.
- `canvas_app_comments`: app-only reads of the user's Canvas V5 assignment comments.

UI data travels in tool-result `_meta`, rather than conversation text. Canvas tokens remain on the server. The browser's IndexedDB cache is namespaced by the authenticated Canvas V5 user.

## Account support

API-token and OAuth connections with stored credentials support the frontend's Canvas REST read views, including modules, assignments, submissions, grades, people, and inbox. API failures remain visible errors. Pagination cannot send credentials to another origin.

Browser-session connections use the existing server cache: courses, assignments, submission summaries, pages, announcements, quizzes, files, and calendar data. The cache does not contain modules, inbox, or complete enrollment/submission details. Those views report that a token connection is needed. No browser session cookies are available inside the ChatGPT sandbox.

The plugin retains its existing `canvas:read` / `canvas:refresh` permissions. It does not add Canvas write authority. Submitting work and account management open the regular web frontend; mutations are rejected by the ChatGPT transport, and the server exposes no write proxy. Refreshing the browser-session cache continues to use the existing `canvas_refresh` tool and extension sync flow.

## Build and connect

1. Run `bun install`, then `bun run build`. The MCP app build generates both the existing inline widgets and the full frontend HTML. Turbo caches the generated resources with their build outputs.
2. Deploy the web app with the existing `/api/mcp` endpoint. No database migration or browser-extension release is required for this integration.
3. Refresh the Canvas V5 plugin's tool metadata in ChatGPT (or reconnect it if the host retains the previous metadata).
4. Open **Canvas workspace** from the sidebar or a conversation panel. Verify a real connected account, course modules, assignment details, and submission status.

The local MCP-host fixture verifies rendering and navigation, not ChatGPT publication, production OAuth, or live Canvas API access. In-host verification remains a deployment check.

## References

- [Plugin Extensions](https://developers.openai.com/plugins/build/extensions)
- [TypeScript entrypoint registration](https://github.com/openai/mcp-extensions/blob/main/typescript/README.md#ui-entrypoints)
- [Extension protocol and deep links](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md)

## Host styling

The embedded entrypoint applies MCP host theme, style variables, and font CSS on
initial connection and host context updates. `canvas-host-styles.ts` maps those
tokens to our existing semantic theme variables. Scoped rules in `canvas-app.css`
adapt shared buttons, cards, fields, and popup corners. Missing tokens retain
Canvas defaults; partial updates preserve previously supplied values. The web
and browser-extension runtimes do not load this stylesheet or token adapter.

For a component-specific adjustment, import `useIsChatGPT` from
`@canvas-v5/ui/hooks/use-ui-host`. `CanvasApp` supplies its context from the SDK
runtime mode, so detection does not depend on user agents or merely being in an
iframe. Most components need no conditional code because their existing theme
utilities already consume the mapped values.

Host layout rules live in `canvas-host-layout.css`: one 20px card inset, 40px vertical / 32px horizontal
page gutters (16px on narrow screens), and assignment columns that respond to
the available content width. Keep these layout rules after host component CSS
when previewing or integrating a vendor stylesheet; otherwise card/header
padding can be counted twice. The official stylesheet screenshot harness is a
local preview; the production entrypoint currently uses the token adapter.

The embedded appearance now follows the supplied desktop references: a flat
app surface, subtle outlined cards, restrained corners, and system typography.
These are scoped Canvas component rules with host token overrides, not a claim
that the official OpenAI `.card` stylesheet is imported. The built plugin itself
is used for the current screenshots, without temporary vendor CSS substitution.

## Dev plugin branch

Push `codex/chatgpt-plugin-dev` to trigger the project's Vercel Git preview.
Only this branch in Vercel's preview environment automatically uses its
`VERCEL_URL` for app auth, OAuth issuer, and MCP audience. Production and other
branches keep their configured origins. This preview uses the project's
existing Preview environment/database settings, not an isolated data sandbox.

After the preview is ready and reachable by ChatGPT, run:

```sh
python3 scripts/package-chatgpt-dev.py --url https://DEPLOYMENT.vercel.app/api/mcp
```

The script checks resource metadata and the unauthenticated MCP challenge before
creating `dist/canvas-v5-dev.zip`. Import that archive as a separate private
plugin and connect your Canvas V5 account. Vercel deployment protection must not
intercept MCP/OAuth requests; the packaging check fails if it does.
