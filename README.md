<div align="center">
  <img src="./.res/logo.svg" alt="CredStore logo">
  <br>
  <img src="./.res/text.svg" alt="CredStore">
</div>

<p align="center"><b>1.0.6</b></p>

CredStore is a strictly offline personal credential manager for desktop, web, and Android.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript 5](https://img.shields.io/badge/TypeScript-5-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js 14.2.35](https://img.shields.io/badge/Next.js-14.2.35-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![React 18](https://img.shields.io/badge/React-18-20232A?logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Electron 27](https://img.shields.io/badge/Electron-27-191970?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Electron Builder 24.6.4](https://img.shields.io/badge/Electron_Builder-24.6.4-313244?logo=electronbuilder&logoColor=white)](https://www.electron.build/)
[![Capacitor 5.5.1](https://img.shields.io/badge/Capacitor-5.5.1-119EFF?logo=capacitor&logoColor=white)](https://capacitorjs.com/)
[![Tailwind CSS 3.3](https://img.shields.io/badge/Tailwind_CSS-3.3-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Radix UI 1.x](https://img.shields.io/badge/Radix_UI-1.x-161618?logo=radixui&logoColor=white)](https://www.radix-ui.com/)
[![Lucide 0.294](https://img.shields.io/badge/Lucide-0.294-4DBA87?logo=lucide&logoColor=white)](https://lucide.dev/)
[![Security AES-256-GCM](https://img.shields.io/badge/Security-AES--256--GCM-green)](https://en.wikipedia.org/wiki/Galois/Counter_Mode)
[![Web Crypto API](https://img.shields.io/badge/Web_Crypto_API-Browser_native-000000?logo=mozilla&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)

## Install

### npm

```bash
npm install -g credstore
credstore
```

On Linux, the desktop launcher is installed automatically during package installation. You should not need to run `credstore --install-desktop` manually.

### GitHub

```bash
npm install -g github.com:LocaMartin/credstore
credstore
```

### Windows

```powershell
winget install LocaMartin.CredStore
```

If the winget manifest is not available yet, download the Windows installer from GitHub Releases.

### Android

GitHub Releases include Android APK/AAB artifacts from the release workflow. The Uptodown listing can be used when published:

```text
https://credstore.en.uptodown.com/android
```

## Features

- Strictly offline credential storage.
- AES-256-GCM encrypted vault data.
- PBKDF2-SHA-256 key derivation with 600,000 iterations and 24-byte salts.
- Encrypted vault keys wrapped by one or more password master keys.
- Optional fingerprint and face recognition login controls are visible on the login screen.
- Flexible credential fields: store usernames, passwords, API secrets, URLs, tokens, notes, or any custom key/value.
- Per-field secret masking and copy controls.
- Credential notes are shown on saved credential cards.
- Website, API, database, and other categories.
- Search and category filtering.
- Post-login settings with multiple themes and master-key management.
- Local Sync button with one-time pairing code UI for future QR/Bluetooth/Wi-Fi device-to-device sync.
- Android immersive full-screen mode to remove the black bezel/status area.
- Android `FLAG_SECURE`, disabled app backup, and no Internet permission.
- Electron network request blocking, permission denial, renderer sandboxing, and content protection.
- Restrictive Content Security Policy with `connect-src 'none'`.

## Master Keys

CredStore supports multiple password master keys. Each password master key wraps the same random vault key, so any
enabled password key can unlock the vault without storing plaintext credentials or a reusable password verifier.

Fingerprint and face recognition controls are present on the login form and in settings. Secure biometric unlock still
requires native biometric keychain integration before those controls can unlock the vault.

## Security Architecture

CredStore does not rely on hiding secrets inside the app binary. If someone decompiles the app with Ghidra, IDA Pro, apktool, or `strings`, user credentials still depend on:

- The user's master key strength.
- Random salts and IVs.
- PBKDF2-SHA-256 key stretching.
- AES-256-GCM authenticated encryption.
- No stored plaintext master key.
- No stored reusable login verifier.

Offline brute force cannot be made impossible if an attacker has the encrypted vault and the user chose a weak master key. Use a long, unique master key.

## Strict Offline Controls

- The web app uses a CSP with `connect-src 'none'`.
- Electron blocks non-local network requests at the session level.
- Android removes the Internet permission from the merged manifest.
- Android cleartext traffic is disabled.

Development builds may use `localhost` for Next.js and Electron dev mode.

## Encryption Process

1. User enters a master key.
2. PBKDF2 derives a key from the master key and random salt.
3. That derived key unwraps the random vault key.
4. The vault key decrypts the AES-256-GCM vault payload.
5. Failed unlock attempts apply local exponential backoff.
6. New vault writes re-encrypt credential data locally only.

## Reset

If you forget every master key, the vault cannot be recovered. There are no recovery keys, backdoors, or server copies.

Use the `Reset` button on the login screen to delete local vault data and start fresh. Reset removes both current and legacy storage keys:

```javascript
localStorage.removeItem("credstore_vault_v2");
localStorage.removeItem("credstore_data");
location.reload();
```

On Android, reset also clears Capacitor Preferences through the app UI.

## Tests

```bash
npm run test:security
npm run lint
npx tsc --noEmit
npm run build
npm run android:sync
```

For Android native packaging, use JDK 17:

```bash
cd android
JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 ./gradlew assembleDebug assembleRelease
```

## Distribution

- GitHub Releases: desktop installers and Android release files.
- npm: CLI and Electron launcher.
- winget: Windows package distribution.
- Uptodown: Android listing when published.

## Upcoming

- Native biometric keychain integration for fingerprint and face recognition unlock.
- QR scanner and local Bluetooth/Wi-Fi sync transport.
- Virtual scrolling for large vaults.

## Contributing

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/amazing-feature`.
3. Commit your changes: `git commit -m "Add amazing feature"`.
4. Push to the branch: `git push origin feature/amazing-feature`.
5. Open a Pull Request.

<div align="center">
<table>
  <tr>
    <td><a href="DOC4DEV.md">DOCUMENTATION FOR DEVELOPERS</a></td>
  </tr>
</table>
</div>
