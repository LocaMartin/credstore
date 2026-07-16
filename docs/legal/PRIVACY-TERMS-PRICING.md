# CredStore Privacy, Terms, and Pricing

This combined offline document collects the customer-facing privacy policy, legal terms, and pricing matrix used by
CredStore. It is bundled with the app so users can review the core legal and commercial information without network
access.

## Privacy Summary

CredStore is designed as a local, offline credential manager. Vault contents, plaintext credentials, master keys,
biometric templates, and local sync payloads are not sent to CredStore servers.

Credential data stays on the user's device unless the user explicitly exports, backs up, or syncs encrypted data to
another device. CredStore does not provide a hosted vault, server-side recovery, cloud password sync, or master-key
escrow.

Users are responsible for device security, backups, operating-system updates, endpoint protection, and retaining access
to their master keys.

## Terms Summary

The public CredStore repository is licensed under AGPLv3-or-later unless a file or directory is expressly marked with a
different license. CredStore Pro and Enterprise features are governed by the commercial EULA in `LICENSE-PRO.md`.

The software is provided for offline credential management. Users must not bypass license validation, tamper with
integrity controls, redistribute commercial license material, or use commercial features outside the licensed scope.

CredStore does not guarantee recovery of forgotten master keys. If every master key is lost, the encrypted vault cannot
be decrypted by CredStore.

## Pricing Summary

### Free Community

- Local encrypted vault
- Manual backup and restore
- One-time QR local sync
- Up to 5 local sync devices
- Community updates
- AGPLv3 public source license

### Pro Lifetime

- Everything in Free Community
- Offline signed Pro license
- Higher local sync limits
- Biometric unlock where supported by the operating system
- Local Bluetooth and one-time QR sync
- Priority bug fixes for supported platforms
- Commercial EULA for Pro features

### Enterprise Offline

- Everything in Pro Lifetime
- Organization license with seat and device limits
- Offline license files and QR activation
- B2B invoice support
- Security architecture documentation
- Deployment guidance for Linux, Android, macOS, iOS, and Windows
- Optional private builds and hardening configuration
- Commercial EULA and procurement-ready paperwork

## Source Documents

This combined view is based on:

- `docs/legal/PRIVACY.md`
- `docs/legal/TERMS.md`
- `docs/website/PRICING.md`
