<div align="center">
  <img src="./.res/logo.svg" alt="CredStore logo">
  <br>
  <img src="./.res/text.svg" alt="CredStore">
</div>

<p align="center"><b>1.0.9</b></p>

CredStore is a strictly offline personal credential manager for desktop, web, and Android.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript 5.9.3](https://img.shields.io/badge/TypeScript-5.9.3-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js 16.2.10](https://img.shields.io/badge/Next.js-16.2.10-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![React 19.2.7](https://img.shields.io/badge/React-19.2.7-20232A?logo=react&logoColor=61DAFB)](https://react.dev/)
[![Electron 43.1.0](https://img.shields.io/badge/Electron-43.1.0-191970?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Electron Builder 26.15.3](https://img.shields.io/badge/Electron_Builder-26.15.3-313244?logo=electronbuilder&logoColor=white)](https://www.electron.build/)
[![Capacitor 8.4.1](https://img.shields.io/badge/Capacitor-8.4.1-119EFF?logo=capacitor&logoColor=white)](https://capacitorjs.com/)
[![Tailwind CSS 3.4.19](https://img.shields.io/badge/Tailwind_CSS-3.4.19-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Radix UI 1.1.x](https://img.shields.io/badge/Radix_UI-1.1.x-161618?logo=radixui&logoColor=white)](https://www.radix-ui.com/)
[![Lucide 1.24.0](https://img.shields.io/badge/Lucide-1.24.0-4DBA87?logo=lucide&logoColor=white)](https://lucide.dev/)
[![Security AES-256-GCM](https://img.shields.io/badge/Security-AES--256--GCM-green)](https://en.wikipedia.org/wiki/Galois/Counter_Mode)
[![Web Crypto API](https://img.shields.io/badge/Web_Crypto_API-Browser_native-000000?logo=mozilla&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)

## Install

### npm

```bash
npm install -g credstore
credstore
```

On Linux, the desktop launcher is installed automatically during package installation when npm allows install scripts.
If install scripts are blocked, `credstore` still launches by caching Electron in the current user's cache directory.

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
- Native Android biometric keychain support for fingerprint and strong face unlock.
- Flexible credential fields: store usernames, passwords, API secrets, URLs, tokens, notes, or any custom key/value.
- Per-field secret masking and copy controls.
- Credential notes are shown on saved credential cards.
- Website, API, database, and other categories.
- Search and category filtering.
- Post-login settings with multiple themes and master-key management.
- Offline Sync button with client/receiver modes, chunked one-time QR generation, camera scanning, and paste fallback.
- Community sync for up to 5 devices, with signed offline enterprise licenses for larger teams.
- Employee profile and role metadata foundation for enterprise visibility controls.
- Android edge-to-edge layout and frameless Electron desktop windows to remove black bezel/titlebar space.
- Android `FLAG_SECURE`, disabled app backup, no Internet permission, and hardcoded `credstore` deep-link scheme.
- Electron network request blocking, permission denial, renderer sandboxing, and content protection.
- Restrictive Content Security Policy with `connect-src 'none'`.

## Master Keys

CredStore supports multiple master keys. Each password master key wraps the same random vault key, so any enabled
password key can unlock the vault without storing plaintext credentials or a reusable password verifier.

Password master keys must be at least 8 characters and include lowercase, uppercase, number, and symbol characters.
After 10 failed unlock attempts, CredStore applies a local lockout delay.

Fingerprint and face recognition keys are available on Android devices that support strong biometrics. The Android
implementation stores a wrapped vault key through Android Keystore and requires biometric confirmation before the key can
be used.

Desktop biometric unlock is not implemented. There is no single secure package that covers Android, iOS, Windows, macOS,
and Linux hardware biometrics with vault-key unwrapping. iOS needs an Apple LocalAuthentication Capacitor plugin. macOS,
Windows, and Linux need separate Electron main-process integrations; Linux biometric support usually depends on local
PAM/fprintd configuration and is not reliable enough to present as a default unlock method.

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
- Electron production file loading is restricted to the exported app directory.
- Android removes the Internet permission from the merged manifest.
- Android cleartext traffic is disabled.
- The app uses a hardcoded `credstore` deep-link scheme.

Development builds may use `localhost` for Next.js and Electron dev mode.

## Dual-Licensing & Why Sponsor CredStore?

CredStore is fundamentally built on a zero-knowledge, client-side open-source architecture. The core codebase is proudly
licensed under the permissive MIT License because transparency is non-negotiable in security tools.

However, building cross-platform environments, maintaining native security wrappers like Android Keystore and Electron
sandbox isolation, and hosting packages on official storefronts incurs real-world platform fees.

We balance this using an Open-Core model based on convenience and scale.

### 1. Frictionless Distribution vs. Manual Compilation

- The Free Path: You can freely clone this repository, install dependencies via Node.js, compile your own Electron
  desktop binaries, use the local terminal engine, or sign an Android APK/AAB target with your own developer keys.
- The Paid Path: When you purchase CredStore on the official app stores, you are paying for frictionless convenience. You
  receive a signed, code-verified, sandboxed, and auto-updating application with a single click. Your app store purchase
  directly funds ongoing developer ecosystem fees.

### 2. Community vs. Enterprise & Team Edition

To accommodate normal personal use while funding large-scale operational tools, the software enforces scale boundaries
locally:

- Community Edition (Free): Completely free local vault management and secure chunked QR-code synchronization for up to
  5 local devices.
- Enterprise Edition (Paid): Designed for businesses and collaborative privacy teams requiring structured profile
  management, employee/admin access metadata controls, and synchronization across larger hardware fleets.

### 3. Local License Verification (Privacy First)

True to the strictly offline app design policy, license token validation happens locally using asymmetric public-key
cryptography. The application reads a signed offline token; it never speaks to a license activation server or exposes your
footprint to the internet.

License generation happens outside the app:

- GitHub Pages source: `web/license-portal/`
- Cloudflare Worker signer: `workers/license-worker/`
- Commercial/proprietary source area: `premium/pro/`
- Commercial license terms: `LICENSE-PRO.md`

The static website must never contain the private signing key. The Cloudflare Worker signs tokens with
`LICENSE_PRIVATE_JWK` stored as a Worker secret. The app ships only the public verification key.

Offline anti-piracy cannot completely stop someone from copying a license token or photographing a QR code. CredStore can
reduce abuse with signed tokens, buyer/company metadata, local device limits, screenshot protection where supported by the
OS, and commercial terms. It cannot provide server-style activation enforcement without becoming an online app.

## Supporting the Mission

If CredStore secures your personal data infrastructure, consider fueling its development:

- Sponsor the Project: Support via [GitHub Sponsors](https://github.com/sponsors/LocaMartin) or Open Collective to help
  execute roadmap items like local Bluetooth/Wi-Fi transport channels.
- Corporate Backing: Privacy-focused organizations and security firms can secure premium visibility slots on repository
  documentation by choosing a corporate sponsorship tier.

## Encryption Process

1. User enters a master key.
2. PBKDF2 derives a key from the master key and random salt.
3. That derived key unwraps the random vault key.
4. The vault key decrypts the AES-256-GCM vault payload.
5. Failed unlock attempts apply local exponential backoff.
6. New vault writes re-encrypt credential data locally only.

## Reset

If you forget every master key, the vault cannot be recovered. There are no recovery keys, backdoors, or server copies.

After login, open Settings and use `Reset` in the danger zone to delete local vault data and start fresh. Reset removes
current vault storage, legacy storage, and failed-unlock lockout state:

```javascript
localStorage.removeItem("credstore_vault_v2");
localStorage.removeItem("credstore_data");
localStorage.removeItem("credstore_lockout_until");
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

For Android native packaging, use JDK 21:

```bash
cd android
JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 ./gradlew assembleDebug assembleRelease
```

## Distribution

- GitHub Releases: desktop installers and Android release files.
- npm: CLI and Electron launcher.
- winget: Windows package distribution.
- Uptodown: Android listing when published.

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
