# Contributing

## Development setup

Use Node.js 22.13 or newer and npm:

```sh
npm ci
```

The app uses Expo Continuous Native Generation. Do not commit generated `android/` or `ios/` directories, the ignored `.tooling/` directory, APKs, keystores, launch tokens, cookies, API keys, or other credentials.

## Making changes

Create a branch from `main` and keep changes focused. Follow the existing TypeScript and React Native style, and add or update tests for changed behavior.

Run the relevant checks before opening a pull request:

```sh
npm test -- --runInBand
npm run typecheck
npm run lint
npm run bundle:android
npx expo-doctor
```

When production dependencies change, regenerate and commit the notices:

```sh
npm run notices
```

## Review and releases

Pull requests require a green CI verification and release build. Real-server acceptance uses protected credentials and is run by the maintainer when a change affects connection or session behavior. Do not put test credentials or token-bearing links in issues, pull requests, logs, screenshots, or fixtures.

Signed releases and repository visibility changes are maintainer decisions. See `SECURITY.md` for private vulnerability reporting.
