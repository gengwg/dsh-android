# DSH Android

Native Expo SDK 58 client for an existing DeepSeek Harness (DSH) server. The app does not include a server, relay, or WebView wrapper.

The implementation is in progress. See the [implementation plan](docs/superpowers/plans/2026-11-04-dsh-android-client.md) for scope, milestones, and verification gates. The target server and official client package version is `0.2.1-rc.5`.

## Setup

Use Node.js 22.13 or newer and npm:

```sh
npm ci
npm start
```

A JDK and Android SDK are required for a development build or APK. An Android Metro export is not a substitute for device-runtime verification.

## Checks

```sh
npm test -- --runInBand
npm run typecheck
npm run lint
npm run bundle:android
npx expo-doctor
```

Keep launch tokens, cookies, and authorization values out of logs, errors, screenshots, and test fixtures. Do not publish or push build artifacts from the implementation environment.
