# Changelog

All notable changes to CredStore will be documented in this file.

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
