# DSH Android

Native Expo SDK 58 client for an existing DeepSeek Harness (DSH) server. The app connects directly to the server; it does not include a relay, backend, or WebView wrapper.

## Features

- One-time launch-token bootstrap and encrypted cookie storage with Expo Secure Store.
- Workspace selection, session lists, session creation, and saved preferences.
- Conversation history, prompting, streaming, cancellation, and older-message paging.
- Permission approvals and structured user questions, including continued questions after timeout/reconnect.
- Per-session drafts, reconnect handling, and confirmed local sign-out.

The target server and official client package version is `0.2.1-rc.5`. See the [implementation plan](docs/superpowers/plans/2026-11-04-dsh-android-client.md) for architecture and verification gates.

## Setup

Use Node.js 22.13 or newer and npm:

```sh
npm ci
npm start
```

In the app, enter the DSH base URL and a launch token from the server's connection link. HTTPS is required by default. HTTP requires an explicit opt-in in the UI and can expose prompts and credentials; Android may still block cleartext traffic. Do not enable cleartext traffic globally for a production build.

A JDK and Android SDK are required for a development build or APK. This checkout includes an ignored project-local toolchain under `.tooling/`; no system JDK or Android SDK installation is required:

```sh
source .tooling/env.sh
./node_modules/.bin/expo prebuild --platform android --no-install
./android/gradlew --no-daemon -p android assembleRelease
```

For the debug-only emulator variant:

```sh
source .tooling/env.sh
./android/gradlew --no-daemon -p android -PreactNativeArchitectures=x86_64 assembleDebug
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

`expo-crypto` supplies secure native `crypto.getRandomValues`; `src/runtime/polyfills.ts` installs that and `Symbol.dispose` before the DSH clients load.

## Verification

The app passes 15 Jest suites with 79 tests, TypeScript, ESLint, clean dependency installation, official-client composition/disposal, and Android Hermes export. Both release and debug APKs build successfully.

On an Android 37 emulator, the release app starts successfully. A disposable local transport check also verified repeated `/connect` cookie capture, authenticated WebSocket headers, and credential restoration after a cold restart. No real credentials were used. These checks do not cover a real DSH server's workspace/chat workflows or release cleartext behavior.

## Checks

```sh
npm test -- --runInBand
npm run typecheck
npm run lint
npm run bundle:android
npx expo-doctor
```

The checked-in dependency graph uses an npm override to Zod `4.6.7`, which addresses GHSA-mrhx-c7xc-m3w5 while retaining the official DSH client versions. Do not apply `npm audit fix --force`.

`metro.config.js` maps three high-level `0.2.1-rc.5` `/client` imports to their shipped plain ESM artifacts because their public entries are browser-loader-only. This is a version-pinned compatibility layer; review it whenever upgrading DSH rather than assuming the non-public paths are stable.

## CI and signed releases

`.github/workflows/android.yml` runs all Jest tests, typecheck, lint, production audit, Expo Doctor, Metro export, and the Gradle release build on pushes and pull requests. Tagging `v*` additionally decodes the protected signing key from GitHub Secrets, builds the APK with the custom release certificate, and publishes a prerelease. Non-tagged builds use the development signing fallback only.

The signing key and passwords are supplied only through the `DSH_RELEASE_*` secrets/environment variables. They are never committed to the repository or printed by the build.

After the workflow reaches `main`, `Real server acceptance` can be run manually from GitHub Actions. It uses `DSH_TEST_SERVER_URL` and `DSH_TEST_LAUNCH_TOKEN` from repository secrets to exercise connection, session creation, prompting, restart recovery, and sign-out on an Android emulator. Use only a dedicated test server and never paste those values into logs or pull requests.

## Security and privacy

Keep launch tokens, cookies, and authorization values out of logs, errors, screenshots, and test fixtures. Sign-out closes local streams and deletes saved cookies on the device; it does not revoke server-side sessions or other clients. Do not publish or push build artifacts from the implementation environment.
