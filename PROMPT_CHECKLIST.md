# Prompt Completion Checklist

This checklist audits current project state.

Status legend:

- [x] Implemented in the project.
- [~] Partially implemented, UI/documentation exists, or implementation needs native/runtime verification.
- [ ] Not implemented.

## Prompt 1

- [x] Read and inspect the project files before editing.
  - Main implementation files audited: `app/page.tsx`, `lib/secure-vault.ts`, `electron/main.js`, Android manifest/activity, scripts, README, changelog, workflow.
- [x] Analyze the provided UI screenshots and address the visible UI issues.
  - Android fullscreen/immersive mode was added.
  - Add Credential notes/modal visibility was adjusted in v1.0.6.
- [x] Remove the Android black bezel and make the app fullscreen.
  - `MainActivity.java` uses immersive sticky fullscreen flags, transparent bars, and `FLAG_SECURE`.
- [x] Fix vault persistence so app data is not erased after backing out of the app.
  - `lib/secure-vault.ts` uses Capacitor Preferences on mobile and `localStorage` fallback elsewhere.
  - Vault records are written under `credstore_vault_v2`.
- [x] Store essential CredStore vault data.
  - Vault payload, wrapped vault keys, key slots, timestamps, and credentials are persisted.
- [x] Add support for more than one password master key.
  - Settings can add additional password master keys that wrap the same vault key.
- [x] Add fingerprint master key.
  - Android biometric key slots store a wrapped vault key using Android Keystore.
  - Login can unlock through a saved fingerprint key on devices with strong biometrics.
- [x] Add facial recognition master key.
  - Android biometric key slots use the same native strong-biometric path for supported face unlock devices.
- [~] Let users unlock with any master key or multiple master keys.
  - Multiple password master keys work.
  - Android fingerprint/strong face keys work when the device supports strong biometrics.
  - Desktop biometric unlock is not implemented.
- [x] Save master key as a credential to login without storing the plaintext master key.
  - The app stores encrypted key slots, not plaintext master keys or reusable password verifiers.
- [x] Allow custom credential key/value fields instead of only username/password.
  - Users can edit both the field name and value.
  - Additional fields can be added and removed.
- [x] Automatically install the Linux desktop launcher after npm install.
  - `package.json` has a `postinstall` script.
  - `scripts/postinstall-desktop.js` creates the desktop file on Linux.
- [x] Replace Export with Sync.
  - The UI exposes `Sync`; no Export button remains in the main app.
- [~] Add local device-to-device sync using one-time QR code, Bluetooth, or Wi-Fi.
  - One-time QR payload generation, camera scanning, and paste import are implemented.
  - Bluetooth and Wi-Fi transport plugins are not implemented; current sync transfers the encrypted vault through QR payload import.
- [x] Add Settings button only after login.
  - Settings is rendered only in the unlocked dashboard.
- [x] Add multiple theme options.
  - Themes: Indigo, Emerald, Slate, Rose.
- [x] Add master key edit/change management in settings.
  - Users can add/remove password master keys.
  - Last password key cannot be removed.

## Prompt 2

- [x] Improve code readability and format long code strings where practical.
  - Major UI strings/classes were split and security helpers were extracted to `lib/secure-vault.ts`.
- [~] Harden encryption against decompilers such as Ghidra, IDA Pro, apktool, and `strings`.
  - Implemented PBKDF2-SHA-256 with 600,000 iterations, 24-byte salts, AES-256-GCM, random vault key wrapping, AAD context, and no plaintext master key storage.
  - No app can make weak user master keys uncrackable if an attacker has the encrypted vault.
- [~] Harden login so the login algorithm cannot be reverse engineered and used for login cracking.
  - There is no stored reusable verifier.
  - Unlock requires decrypting a wrapped vault key and then the vault payload.
  - Local exponential backoff exists in the UI.
  - Offline brute force is still possible against weak master keys if an attacker obtains the encrypted vault.
- [x] Make the app strictly offline.
  - Web CSP includes `connect-src 'none'`.
  - Electron blocks non-local requests and denies permissions.
  - Android removes the Internet permission and disables cleartext traffic.
  - Development mode may still use localhost.
- [x] Perform bug/security tests.
  - `npm run test:security` exists and has passed.
  - `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run android:sync`, and Android `assembleDebug` passed during v1.0.7 verification.
- [x] Add a changelog file.
  - `CHANGELOG.md` exists and contains entries for v1.0.5 and v1.0.6.

## Prompt 3

- [x] Verify Prompt 1 and Prompt 2 work was addressed before release.
  - Implemented items are reflected in code and docs.
  - Native biometric unlock and real local sync transport remain partial.
- [x] Change project version from 1.0.4 to 1.0.5.
  - Completed in v1.0.5.
- [x] Create and push git tag for v1.0.5.
  - Tag `v1.0.5` was created and pushed.
- [x] Push the new version.
  - `main` was pushed with the v1.0.5 release commit.
- [x] Release using GitHub workflow and generated release notes.
  - GitHub Actions release workflow completed successfully for v1.0.5.
- [x] Update README according to Prompt 1 and Prompt 2.
  - README was updated for v1.0.5 and then refined in v1.0.6.

## Prompt 4

- [x] Restore old README as `README.md.bak`.
  - `README.md.bak` exists.
- [x] Add versions of the tech stack to README badges.
  - README badges include TypeScript 5.9.3, Next.js 16.2.10, React 19.2.7, Electron 43.1.0, Electron Builder 26.15.3, Capacitor 8.4.1, Tailwind CSS 3.4.19, Radix UI 1.1.x, and Lucide 1.24.0.
- [x] Use the CredStore logo instead of the previous generated shield icon/image.
  - README references `./.res/logo.svg`.
  - Runtime UI uses a public `logo.svg` copy of the same asset so Android and Electron can load it reliably.
- [x] Fix saved notes not being visible.
  - Credential cards render `credential.notes`.
- [x] Fix Notes field visibility while typing on phone.
  - Add Credential dialog uses a constrained modal with an internal scroll area.
  - Notes textarea is taller and the submit button is sticky at the bottom of the scroll area.
- [x] Remove completed roadmap items from README.
  - Native Android biometric keychain support and QR sync are documented as implemented.
  - Browser extension and Web Workers are not listed.
- [x] Do not add Browser extension to README roadmap.
  - README no longer lists Browser extension.
- [x] Do not add Web Workers for encryption to README roadmap.
  - README no longer lists Web Workers for encryption.
- [x] Add optional fingerprint and face recognition master key to login form.
  - Login form shows Fingerprint and Face buttons.
  - Android buttons call the native biometric plugin when a matching biometric master key exists.
- [x] Make version 1.0.6.
  - `package.json`, `package-lock.json`, app UI, Android config, and docs use v1.0.6.
- [x] Release v1.0.6.
  - Commit `8327f83` and tag `v1.0.6` were pushed.
  - GitHub release was published.

## Prompt 5

- [x] Update vulnerable libraries to current versions where practical.
  - Runtime stack updated to Next.js 16, React 19, Electron 43, Capacitor 8, and current AndroidX build dependencies.
  - `npm audit --omit=dev` reports 0 vulnerabilities.
  - Full audit still reports Next's bundled `postcss`; npm's offered fix is a breaking downgrade to Next 9.
- [x] Make fingerprint and face unlock actually work on Android.
  - Added `CredStoreBiometricPlugin.java`.
  - Registered the plugin in `MainActivity.java`.
  - Biometric key slots encrypt/decrypt the vault key through Android Keystore after strong biometric confirmation.
- [x] Fix Android logo visibility.
  - Added `public/logo.svg` as a non-hidden runtime copy of `./.res/logo.svg`.
  - App UI and QR logo rendering use `./logo.svg`, which works in Android and Electron.
- [~] Make Sync actually work.
  - Client mode generates a one-time QR payload with the CredStore logo.
  - Receiver mode scans with camera through `BarcodeDetector` or imports a pasted payload.
  - The imported payload stores the encrypted vault locally and locks the receiver for normal unlock.
  - Bluetooth/Wi-Fi transport is still not implemented.
- [x] Move Reset button to Settings.
  - Reset is no longer rendered on the public login form.
  - Reset is available post-login in Settings danger zone.
- [x] Enforce master-key login policy.
  - New password master keys require lowercase, uppercase, number, symbol, and at least 8 characters.
  - At least one password master key is created on first vault setup.
  - Lockout state is stored after 10 failed unlock attempts.
- [x] Harden input/deep-link handling.
  - Credential title, notes, field names, and field values are bounded and sanitized.
  - Electron production file loading is restricted to exported app files.
  - Deep-link scheme is hardcoded as `credstore`.
- [x] Update release metadata.
  - Version is v1.0.7 in package metadata, app UI, Android config, README, and changelog.
  - Release workflow now uses Java 21 for Capacitor 8 Android builds.

## Current Known Gaps

- [ ] Real Bluetooth sync transport.
  - Needs native Bluetooth plugin and encrypted local transfer protocol.
- [ ] Real Wi-Fi local sync transport.
  - Needs local network discovery/transport while preserving strict offline/no-internet behavior.
- [ ] Virtual scrolling for large vaults.
  - Not implemented.
- [~] npm package publish.
  - v1.0.6 publish failed locally because the npm account did not have permission to publish `credstore`.
  - v1.0.7 package metadata and prepack build are prepared, but publishing still depends on npm registry ownership/auth.

## Current Worktree Notes

- `DOC4DEV.md` has existing uncommitted changes.
- `README.md.bak` has existing uncommitted changes.
- `.res/featured_image.png` is untracked.
- This checklist has been updated for v1.0.7.
