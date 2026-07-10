# Changelog

All notable changes to CredStore will be documented in this file.

## [1.0.8] - 2026-07-10

### Fixed

- Fixed the npm global launcher so blocked Electron install scripts do not make `credstore` write into `/usr/local`.
- Fixed Android safe-area spacing so the header does not overlap the status bar on fullscreen devices.
- Replaced single-payload QR sync with chunked QR frames and checksum validation.
- Improved Android biometric diagnostics for missing hardware, missing enrollment, unsupported devices, and unavailable native builds.
- Updated Android release workflow behavior so unsigned debug APKs are clearly test-only and signed release artifacts are used for production.
- Replaced the login subtitle with `v1.0.8`.

### Added

- Added offline enterprise license storage and local signed-token validation foundation.
- Added community sync limit metadata for 5 free devices and enterprise license limits for larger deployments.
- Added encrypted-vault profile and role metadata foundation for employee/admin controls.
- Added README guidance for open-core Enterprise & Team Use.

## [1.0.7] - 2026-07-10

### Fixed

- Updated project dependencies to current major versions, including Next.js 16, React 19, Electron 43, Capacitor 8, and Electron Builder 26.
- Added a native Android biometric plugin backed by Android Keystore for fingerprint and strong face unlock.
- Fixed Android logo loading by using the exported app asset path and verifying Android asset sync.
- Moved vault reset out of the public login form and into post-login Settings.
- Made offline sync functional with client/receiver modes, one-time QR payload generation, camera scanning, and paste fallback.
- Hardened local input handling with bounded text sanitization for credential titles, fields, values, and notes.
- Restricted Electron production file loading to exported app files and kept the deep-link scheme hardcoded as `credstore`.
- Raised Android min/compile/target SDK values and updated Gradle/AGP so the Android app builds with Capacitor 8.

### Security

- Enforced master-key policy for newly created password keys: lowercase, uppercase, number, symbol, and at least 8 characters.
- Persisted failed-unlock lockout state after 10 failed attempts.
- Verified production dependencies with `npm audit --omit=dev`.

## [1.0.6] - 2026-07-08

### Fixed

- Replaced the in-app shield icon with the project logo asset at `./.res/logo.svg`.
- Fixed the Add Credential dialog so the form body scrolls inside the modal on small screens and while the mobile keyboard is open.
- Made the notes input taller and kept the submit button reachable while typing.
- Displayed saved credential notes on credential cards.
- Added fingerprint and face recognition controls to the login form with a clear native-keychain availability message.

### Changed

- Added `README.md.bak` containing the previous README.
- Updated README badges with the versions of the major project tech stack.
- Removed Browser extension and Web Workers from the README roadmap.

## [1.0.5] - 2026-07-08

### Security

- Hardened the app for a strictly offline threat model.
- Moved vault encryption and storage helpers into `lib/secure-vault.ts` for easier review.
- Increased PBKDF2 hardening to 600,000 SHA-256 iterations with 24-byte salts.
- Bound AES-GCM vault encryption to a CredStore v2 context with additional authenticated data.
- Kept master keys out of persistent storage; stored data contains encrypted vault data and wrapped vault keys only.
- Added local unlock backoff after failed master-key attempts.
- Disabled Android app backup and explicitly removed the Android Internet permission.
- Added Android `FLAG_SECURE` to reduce screenshot and screen-record exposure.
- Added Electron request blocking, permission denial, renderer sandboxing, and content protection.
- Added a restrictive CSP with `connect-src 'none'` for production web content.

### Changed

- Removed the Android black system bezel by using immersive full-screen mode.
- Persisted encrypted vault data with Capacitor Preferences on mobile and localStorage fallback elsewhere.
- Replaced export UI with local sync pairing UI placeholder for future QR/Bluetooth/Wi-Fi transfer.
- Added flexible credential fields so users can store usernames, passwords, API secrets, URLs, tokens, notes, or custom values.
- Added post-login settings with themes and master-key management.
- Added automatic Linux desktop launcher installation on package install.
- Reformatted dense UI code paths for readability.
- Added `npm run test:security` for offline/security smoke checks.

### Notes

- Decompilation resistance is not treated as a secret. User data security must depend on strong user master keys, Web Crypto, random salts, and authenticated encryption.
- Fingerprint and face unlock still require native biometric keychain integration before they can securely unlock the vault.
