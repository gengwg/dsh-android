# Project status

Updated: 2026-11-07

## Completed

- Native Expo SDK 58 Android client with authentication, workspaces, sessions, chat, approvals, drafts, reconnect handling, and settings.
- Show/hide launch-token control on the login screen.
- 17 Jest suites with 81 tests, TypeScript, ESLint, Expo Doctor, and Android Hermes export passing.
- Real-server acceptance passed for connection, workspace/session creation, assistant responses, restart recovery, and sign-out.
- `v1.0.1` signed and published with `versionCode 2`, `versionName 1.0.1`, and certificate `CN=DSH Android CI Release, OU=CI, O=DSH`.
- Release APK SHA-256: `5f37b9d174ffaeb5c7ef2897005c27b8e3ba9048159d6940d1e78a4b3041101b`.
- Open-source readiness complete: MIT license, generated notices for 602 production packages, notices embedded in the APK, pinned CI actions, and final secret/privacy scans.
- Security and contribution guides added.
- Repository is public at https://github.com/gengwg/dsh-android with a description, latest-release homepage, and relevant topics.

Release: https://github.com/gengwg/dsh-android/releases/tag/v1.0.1

## Planned future work

- Play Store preparation: signed AAB pipeline, permanent application ID, store listing, privacy policy, and internal testing.
- Crash monitoring and staged rollout preparation for a production launch.
- New features and fixes based on real usage.

## Acceptance infrastructure

The Cloudflare tunnel and dedicated DSH acceptance server remain running for future tests. Test credentials remain in GitHub Secrets or ignored owner-only local files; no launch tokens, API keys, signing keys, or session logs are committed to the repository.
