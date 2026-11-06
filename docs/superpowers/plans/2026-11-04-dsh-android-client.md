# DSH Android client implementation plan

Date: 2026-11-04
Source session: `session-38e00841-0cba-4dab-b1d5-67a90cdb8f0d`
Status: implemented; release/debug APKs and disposable Android transport checks complete, real-server workflow verification pending

## Goal and boundaries

Build a chat-first native Android client for an existing DSH server in this Expo SDK 58 repository. Complete the work in verified milestones and create local commits only after explicit confirmation for each commit. Do not push.

Recovered product scope:

- Native server setup using DSH's existing launch-token `/connect` flow.
- Secure credential persistence, reconnect, and local sign-out.
- Workspace selection and session browsing, creation, and reopening.
- Conversation history, prompting, streaming, cancellation, and pending approvals.
- Per-session drafts and recovery after reconnect or app restart.
- Connection/session controls and settings with explicit loading, empty, offline, and error states.

Out of scope: DSH server or Web GUI changes, server administration, project editing, media attachment UI, a WebView wrapper, store signing/deployment, and pushing the repository. Do not add a relay or reimplement DSH's HTTP/WebSocket protocol.

The original detailed acceptance checklist was not preserved. Do not invent additional features; refine behavior only against the recovered scope and installed public client contracts.

## Current state and verified facts

- `/home/gengwg/projects/dsh-android` is on `feat/android-app` with no commits. The Expo scaffold is untracked and no app implementation or plan existed before this document.
- Expo is `~58.0.22`, React Native is `0.88.1`, React is `19.3.0`, and TypeScript is `~6.0.3`. Keep these pins.
- Expo Router and Secure Store are installed. The entry point still registers the default `App.tsx`; `src/app/` does not exist.
- Jest and `jest-expo` are installed, but no test script or tests exist. ESLint and `eslint-config-expo` are not installed.
- Baseline `npx tsc --noEmit` passed on 2026-11-04.
- An ignored project-local JDK 17, Android SDK 37, Gradle, `adb`, and Android 37 emulator are installed under `.tooling/`. Release and debug APK production and Android/Hermes startup are verified.
- The running DSH installation is `0.2.1-rc.5`. Pin compatible official client packages to that version rather than selecting newer releases. The source checkout is `0.2.2-alpha.2` and is not a drop-in protocol reference for the installed Host.
- Installed Connection, Gateway, and Typert Registry packages have standalone `client.node.js` artifacts. The high-level Session Controller, Workspace Controller, and File Upload `/client` entries are browser-loader bundles only; a Metro `node` condition alone cannot load them.
- The installed high-level packages ship plain ESM under non-public `lib/types/client` paths. A pinned Metro-alias spike may use those artifacts, but this is a compatibility hypothesis with an expanded peer-dependency floor, not a public stable entry point. Do not replace failure with a hand-written RPC/Gateway protocol.
- The user approved adding official DSH client packages and their required dependencies. Other new dependencies still require approval.
- The original DSH dependency graph used Zod `4.4.3`, affected by GHSA-mrhx-c7xc-m3w5. With user approval, the app pins an npm override to patched `4.6.7`; composition/disposal, tests, typecheck, and Android bundling pass with it. The production audit then reports zero high/critical findings and eight moderate findings that still require release triage. Never apply a forced audit fix.
- Expo SDK 58 documents `expo/fetch`, native URL/streams support, Secure Store, Expo Router, and Metro package exports. React Native 0.88 source supports WebSocket constructor headers and EventTarget inheritance.
- The first Hermes launch identified missing `crypto.getRandomValues` and `Symbol.dispose`. `expo-crypto` now supplies the secure native random implementation and a startup polyfill installs both before the DSH clients load; release startup then passed on the emulator.
- Expo's Android fetch source disables redirect following for non-`follow` modes and exposes raw response headers. Actual `/connect` cookie visibility remains a device-runtime check, not a conclusion from source alone.

## Architecture and invariants

Use a thin native composition layer around official DSH clients:

```text
Expo Router screens and hooks
  -> workspace/session feature state
  -> official session-controller and gateway clients
  -> official connection client
  -> injected native fetch + WebSocket + stream base URL
  -> existing DSH server

Native bootstrap -> Secure Store cookie pair -> authenticated fetch/WebSocket
```

The official clients remain authoritative for RPC, ordered journals, replay, reconnect, and recovery. The app owns only native bootstrap, credential storage, lifecycle composition, screen state, drafts, and presentation.

Load-bearing invariants:

1. One owned connection generation may reconnect at a time. Stale generations cannot publish state or open replacement sockets.
2. Server journals replace or extend visible history authoritatively. Pagination and live events must not duplicate entries or allow an older session response to overwrite a newer selection.
3. A prompt or approval has one in-flight identity. Retry does not silently repeat a request whose outcome is unknown.
4. Failed sends preserve the draft. Reconnect preserves visible history while authoritative replay reconciles it.
5. Sign-out prevents restart, disposes the gateway/connection and active streams, then deletes Secure Store credentials and in-memory secrets. It is local sign-out, not claimed server-side revocation.
6. Logs, errors, test fixtures, and UI never expose launch tokens, cookie values, or authorization data.
7. No optimistic UI marks a prompt, approval, cancellation, or connection successful before the server confirms it.

## Threat model

Assets are the launch token, session cookie pair, private prompts/history, approval actions, and the integrity of the configured DSH server. Trust boundaries are user-entered server settings, `/connect` and RPC responses, WebSocket frames, Secure Store, and remote model/tool text rendered by the app.

Abuse cases to test beside the use cases: a malicious or mistyped server redirects credential bootstrap to another authority; oversized or malformed cookies exhaust memory or corrupt state; a network attacker changes cleartext traffic; stale sockets publish into a newly selected session; remote text attempts to become executable UI; repeated taps duplicate a prompt or approval; and errors or logs disclose credentials. Controls are URL/authority validation, bounded parsing, encrypted storage, generation ownership, single-flight actions, redaction, and server-confirmed state.

## Causal map

- Metro `node` export-condition selection -> official client artifacts -> available globals/dependencies -> Android bundle and Hermes compatibility.
- `/connect` response headers -> stored cookie pair -> RPC/WebSocket authentication -> every workspace/session API.
- Connection generation -> gateway/session replay -> catalog and conversation state -> composer and recovery behavior.
- Session identity + journal cursor -> ordered rendering and pagination -> bounded long-history performance.
- Disposal ownership -> reconnect cancellation and sign-out -> no stale writes, duplicate sockets, or surviving credentials.

## Milestones

Each milestone ends with its focused tests, `npx tsc --noEmit`, lint once configured, and a reviewed diff. Commit only after the relevant checks pass and the user confirms that commit.

### Milestone 1: record the plan and establish the project harness

Files:

- `docs/superpowers/plans/2026-11-04-dsh-android-client.md`
- `package.json` and `package-lock.json`
- `jest.config.cjs` or equivalent minimal Jest configuration
- `eslint.config.js` only after lint dependency approval
- `README.md` with setup, test commands, server compatibility, and verification limits

Work:

- Add `test`, `typecheck`, `lint`, and Android bundle scripts without replacing existing Expo scripts.
- Configure `jest-expo` and a smoke test before feature code.
- Add SDK-compatible ESLint packages only after explicit approval; do not let `npx` install them implicitly.
- Document the no-push rule and current Android toolchain limitation.

Verification:

- Run a trivial Jest smoke test and inspect the result.
- Run baseline typecheck and, once available, lint.
- Initial commit candidate: scaffold, plan, and harness together, because the repository has no earlier commit.

### Milestone 2: install official clients and pass the Metro/Hermes compatibility gate

Files:

- `package.json` and `package-lock.json`
- `metro.config.js`
- `index.ts`
- `src/runtime/checks.ts` and its focused test
- `src/features/connection/dshComposition.ts` and its composition smoke test

Work:

- Install the verified official client packages and required peers at `0.2.1-rc.5` using the project's npm workflow. Do not install unrelated convenience libraries. Include the narrow remote descriptors and client-store dependencies required by the high-level composition; inspect the lockfile rather than assuming peer hoisting is sufficient.
- Extend `expo/metro-config`; preserve normal `import`/`require` conditions while adding the `node` condition required by the standalone client export maps. Keep package exports enabled.
- Time-box a native-artifact spike for the high-level clients: app code imports their public `/client` entries while Metro aliases the pinned `rc.5` runtime resolution to the shipped plain `lib/types/client` ESM. Keep this non-public packaging workaround isolated in `metro.config.js`. If it cannot bundle and initialize cleanly, stop for a version-matched dual-client packaging decision; do not add a browser ModuleLoader emulation or a lower-level app-owned protocol.
- Convert the entry point to Expo Router, loading only the minimal runtime checks before `expo-router/entry`.
- Verify required globals, including `Promise.withResolvers`, `crypto.getRandomValues`, `AbortController`, `AbortSignal.any`, `Symbol.dispose`, URL, streams, time-zone support, and Blob/FormData only where the selected client mode needs them. Add no polyfill dependency without approval.
- Compose and dispose the official connection/gateway/session/workspace clients through their documented client APIs. Mount only the required remote descriptors, set `interactions: 'answer'`, and inject `streamBaseUrl`; do not rely on `document.baseURI` or bypass host checks.

Verification:

- Unit-test runtime checks and composition/disposal without mocking away the official package imports.
- Run `npx expo export --platform android` and inspect that Metro selects the intended standalone and aliased high-level client artifacts without Node built-ins or browser-loader globals.
- Execute a small Android/Hermes smoke path when a device toolchain is available. Until then, label native compatibility unverified and do not claim the gate passed.

### Milestone 3: native authentication and connection lifecycle

Files:

- `src/features/connection/types.ts`
- `src/features/connection/credentials.ts`
- `src/features/connection/cookie.ts`
- `src/features/connection/nativeTransport.ts`
- `src/features/connection/connectionController.ts`
- `src/features/connection/ConnectionProvider.tsx`
- focused tests beside the modules or under `src/features/connection/__tests__/`

Work:

- Accept and validate the DSH server URL and existing launch-token bootstrap input. Keep the launch token in memory and never log it. Require HTTPS by default and reject embedded credentials, fragments, unexpected paths, and cross-authority redirects; do not enable Android cleartext traffic globally. Any scoped development HTTP exception requires separate user approval.
- Call `/connect` with `expo/fetch`, manual redirect handling, and the Origin behavior required by the server. Do not follow the redirect into the multiplexed socket endpoint.
- Parse the complete server-issued cookie pair with bounded sizes, retaining required attributes/expiry behavior without exposing values. Store reusable credentials with Secure Store and reject cookie/redirect authorities that do not match the configured server.
- Inject the same cookie authority into RPC fetch and WebSocket upgrade headers. Use React Native's EventTarget-compatible WebSocket and required binary mode.
- Model connecting, connected, reconnecting, authentication-required, offline, and failed states. Serialize bootstraps and reconnects with generation cancellation.
- Refresh/rebootstrap after authentication failure or server restart without competing sockets. Clear credentials and dispose all resources in the documented sign-out order.

Focused tests:

- Multiple `Set-Cookie` headers, malformed responses, expiry/refresh, and redacted errors.
- Correct fetch/WebSocket URL, Origin, cookie, and disposal behavior with no real secrets.
- Repeated connect/reconnect/sign-out calls leave one owner and no stale publication.
- Authentication failure requires rebootstrap rather than blind request replay.

Device gate:

- On Android, prove that manual `/connect` exposes both cookie headers, authenticated RPC succeeds, and an authenticated WebSocket opens. If cookie capture is impossible, pause and choose the small native networking-module fallback; do not replace it with a protocol rewrite.

### Milestone 4: workspace and session browser

Files:

- `src/features/workspaces/workspaceController.ts`
- `src/features/sessions/sessionCatalog.ts`
- `src/app/_layout.tsx`
- `src/app/index.tsx`
- `src/app/connect.tsx`
- shared native components and focused tests

Work:

- Add the root provider/stack and connection-aware navigation.
- Build server setup, workspace selection, session list, create, open, refresh, and retry flows using official client methods.
- Keep a responsive native list with bounded pages and explicit initial-loading, refreshing, empty, offline, and error states.
- Ignore stale page responses and dispose subscriptions when the selected workspace or connection generation changes.
- Preserve the selected workspace/session locally without storing conversation secrets in a second database.

Focused tests:

- Workspace/session switching, paging, create/open, stale responses, reconnect snapshots, and cleanup.
- Route behavior for authenticated, authentication-required, and loading states.

### Milestone 5: conversation, controls, approvals, and drafts

Files:

- `src/features/sessions/conversationController.ts`
- `src/features/sessions/drafts.ts`
- `src/features/approvals/approvalController.ts`
- `src/app/session/[id].tsx`
- native transcript, composer, connection-status, and approval components
- focused controller and screen tests

Work:

- Open the official ordered session journal and render bounded history with backward pagination.
- Send prompts through the official session client. Disable duplicate submission while a send identity is unresolved and preserve drafts on failure.
- Reconcile any local pending echo with the authoritative journal; never duplicate durable messages.
- Render assistant text and concise tool/activity state without treating remote content as local instructions or executable UI.
- Support installed-client cancellation/interruption and pending approval responses. Prevent double approval and show terminal/busy states accurately.
- Reconnect and page using official baseline/replay machinery. Bound retained rendering work for long sessions.
- Store per-session drafts separately from durable server history and clear them only after confirmed acceptance or explicit user action.

Focused tests:

- Ordered history, gap/reconnect reconciliation, stale-session isolation, pagination races, and bounded retention.
- Prompt success/failure/unknown outcome, duplicate-tap prevention, draft preservation, and cancellation.
- Approval single-flight behavior, terminal states, and reconnect while an action is pending.
- Screen loading, empty, streaming, offline, and error rendering.

### Milestone 6: settings and end-to-end recovery

Files:

- `src/app/settings.tsx`
- connection/session settings components
- `README.md` and focused tests

Work:

- Show non-secret server/connection state and provide reconnect and local sign-out actions.
- Expose only controls supported by the installed public client API; do not add server administration.
- Verify app restart, credential reload, expired authentication, server restart, session switching, background/foreground transitions, and sign-out during reconnect.
- Document server version requirements, LAN/TLS and cleartext constraints, setup steps, local sign-out semantics, and all unverified platform behavior.

### Milestone 7: full verification and Android artifact

Run and inspect:

```sh
npm test -- --runInBand
npx tsc --noEmit
npx expo lint
npx expo-doctor
npx expo export --platform android
```

Then, after an explicit Android toolchain setup decision:

- Build a development client and run the real `/connect` + RPC + WebSocket gate on Android.
- Exercise the core workflow against the existing DSH server without printing credentials: connect, create/open a session, send/stream, cancel, answer an approval if safely available, reconnect, restart the app, and sign out.
- Produce a local debug APK if the environment permits. Do not sign, publish, or use EAS credentials without a separate request.
- Review `git status`, the complete diff, and test output before requesting confirmation for each milestone commit.

If a required check cannot run, record the exact blocker and keep the associated runtime claim unverified. Do not mark the app fully built on the basis of TypeScript or Metro output alone.

## Verification record

On 2026-11-04, the implemented app passed a clean `npm ci --ignore-scripts`, 15 Jest suites with 79 tests, TypeScript, ESLint, Node composition/disposal with all services and interactions, and Android Hermes export. The production dependency audit reports zero high/critical findings; its eight moderate findings are in Expo's build-time glob/minimatch chain and have no forced compatible remediation.

Independent adversarial review identified seven adapter races. Regression coverage now includes unresolved prompt blocking, approval replay supersession, continued-answer uncertainty, establishment-time cookie refresh, disposal failure during sign-out, durable/pending echo deduplication, and ordered draft reads/writes.

Expo Doctor passes 19/20 checks. Its remaining check reports six recommended Expo patch/minor updates (`expo`, `expo-constants`, `expo-linking`, `expo-router`, `jest-expo`, and `react-native-safe-area-context`); the existing pins were deliberately preserved pending an explicit upgrade decision.

A project-local JDK 17 and Android SDK 37 produced release and debug APKs. The release app starts on an Android 37 emulator. A disposable local server verified repeated `/connect` cookie capture and authenticated WebSocket headers; a cold restart restored the disposable credentials without another token. These tests used no real credentials and do not verify a real DSH server's workspace/chat workflows or release cleartext behavior.
