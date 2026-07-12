# Changelog

All notable changes to CredStore will be documented in this file.

## [1.0.14] - 2026-07-13

### Fixed

- Fixed local sync QR generation reliability by using smaller QR frames and a render boundary so oversized payloads do not
  crash the WebView.
- Replaced placeholder QR scanning with camera-based ZXing scanning for sync and license QR codes.
- Simplified receiver mode to one action: scan the client QR and import the encrypted vault automatically.
- Removed experimental nearby-device send controls from the sync dialog.
- Fixed biometric availability fallback so Android can use the custom native plugin when the generic biometric plugin
  reports unavailable.
- Fixed the Windows install command documentation to use `winget install credstore`.

### Changed

- Updated sync mode buttons with a clear selected state and tap/click animation.
- Reduced QR sync copy to show the correct free limit of 5 devices unless a trial or enterprise license is active.

## [1.0.13] - 2026-07-12

### Added

- Added cross-platform biometric unlock routing for Android/iOS native biometrics and desktop OS prompts.
- Added local Bluetooth sync transport alongside QR sync: Android paired-device RFCOMM, iOS BLE receiver/sender,
  and Electron Web Bluetooth sender support.
- Added release-only Android signing certificate verification using the `EXPECTED_ANDROID_CERT_SHA256` build variable.
- Added release-only Android and iOS runtime self-protection checks for debugger attachment and common instrumentation/root/jailbreak artifacts.
- Added offline license clock rollback detection with a persisted last-seen timestamp.

### Security

- Removed the locally replaceable license public-key override and now reconstructs the Ed25519 public key from in-app
  fragments during verification.
- Hardened Electron production runtime by disabling production DevTools shortcuts, blocking debugger launch flags, checking
  Linux `TracerPid`, and preserving SHA-256 packaged asset integrity validation.
- Documented CredStore's offline security layers: AES-256-GCM vault encryption, PBKDF2 key wrapping, Ed25519 license
  signatures, OS code signing, SHA-256 asset integrity, biometric key release, CSP, no network permission, and runtime
  guards.

## [1.0.12] - 2026-07-11

### Changed

- Switched offline license signing and verification from ECDSA P-256 to Ed25519, matching the intended compact offline license-key design.
- Added a pure JavaScript Ed25519 verifier so license validation is consistent across desktop, Android WebView, and browsers.
- Updated the Cloudflare Worker signer flow to issue `alg: "Ed25519"` license payloads.

### Fixed

- Added a root `logo.svg` and `.nojekyll` so GitHub Pages serves the license portal logo correctly.

## [1.0.11] - 2026-07-11

### Fixed

- Added a root GitHub Pages license portal so `https://locamartin.github.io/credstore/` renders the key generator instead of the repository README.
- Added packaged Electron integrity checks that verify shipped app files against a generated SHA-256 manifest at startup.
- Rotated the offline license public key and refreshed bundled test/trial license tokens; the matching private JWK must be stored only as a Cloudflare Worker secret.

### Security

- Added account-bound Worker token support for the Dashboard-managed license signer flow.
- Kept Cloudflare Worker backend source out of the GitHub repository while preserving the static portal frontend.

## [1.0.10] - 2026-07-11

### Changed

- Removed Cloudflare Worker backend source from the public repository. Worker signing logic is now managed directly in the
  Cloudflare Dashboard with secrets and environment variables.
- Added ignore rules for local Worker source, Wrangler config, and Wrangler cache files.
- Updated README to document Cloudflare variables instead of committed Worker files.

### Security

- Added vault account identity metadata for offline license binding.
- License validation now rejects signed licenses bound to a different CredStore account identity.
- Added the account identity to Settings so paid licenses can be generated for a specific vault without binding to one
  physical device.

## [1.0.9] - 2026-07-11

### Fixed

- Removed the native Electron window frame on desktop and added minimal in-app window controls to remove Linux titlebar/bezel space.
- Reworked Settings into a wider landscape-friendly panel with two columns, internal scrolling, and a visible danger-zone reset button.
- Added license QR scanning in Settings alongside paste-based offline license validation.
- Switched license token parsing to base64url so copied and QR-encoded tokens survive transport reliably.
- Clarified biometric support: Android strong biometrics are implemented; desktop and iOS require separate native integrations.

### Added

- Added a separate GitHub Pages license portal source at `web/license-portal/`.
- Added Cloudflare Worker license signer source for initial deployment.
- Added built-in test and 5-day trial license tokens for local premium feature testing.
- Added `LICENSE-PRO.md` and `premium/pro/` for future commercial-only features under a separate license.
- Expanded README dual-licensing, sponsorship, anti-piracy, and open-core guidance.

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
