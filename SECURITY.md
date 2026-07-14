# CredStore Security Architecture

CredStore is designed as a zero-knowledge, offline-first credential manager. The product assumes the
client device is a hostile environment and layers cryptography, local-only sync, platform key
storage, and offline license verification to reduce risk without requiring cloud access to user
vaults.

This document summarizes the intended security architecture for reviewers, CISOs, and contributors.

## Security Model

CredStore does not operate a hosted password vault. Plaintext credentials, master keys, biometric
templates, and local sync payloads are not sent to CredStore servers. The server-side licensing
system signs offline license tokens; it does not receive or decrypt customer vault contents.

The primary security boundary is the user's device. Users remain responsible for device hardening,
operating-system updates, master-key strength, endpoint security, and backup hygiene.

## Local Vault Cryptography

CredStore vault data should be encrypted with authenticated encryption such as AES-256-GCM or
ChaCha20-Poly1305. Vault encryption keys should be random, high-entropy keys generated locally.

Master passwords should not directly encrypt the database. Instead, the master password should
derive a wrapping key using a memory-hard KDF such as Argon2id with per-vault random salt and
production-calibrated memory, iteration, and parallelism parameters. Where Argon2id is unavailable
on a target platform, PBKDF2-SHA-256 with a high iteration count is an acceptable compatibility
fallback until the native KDF is available.

Recommended properties:

- unique random salt per vault;
- unique nonce or IV per encrypted record;
- authenticated metadata for record IDs, timestamps, and sync versioning;
- separate key slots for password, biometric, and recovery unlock paths;
- no hardcoded vault encryption keys.

## Biometric Key Release

Biometric unlock should use platform security facilities rather than storing fingerprint or face
data in the application. Android should use Android Keystore or StrongBox where available. iOS and
macOS should use Keychain, Secure Enclave, and LocalAuthentication where available. Windows should
use Windows Hello backed key release where available.

The application should store only wrapped vault-key material. The operating system decides whether
biometric authentication succeeds and releases or unwraps the protected key material.

## Offline Device-to-Device Sync

CredStore sync is designed to be air-gapped from cloud infrastructure. Devices exchange encrypted
vault sync payloads directly through local Bluetooth or a one-time QR code.

Recommended sync properties:

- sync payloads remain encrypted and authenticated end to end;
- one-time QR payloads should be short-lived and single-use;
- receiving devices should merge records by stable record IDs and modification timestamps instead
  of replacing the full remote vault;
- deleted records should use tombstones to prevent deleted data from reappearing unexpectedly;
- sync metadata should avoid exposing plaintext credential titles where possible.

## Offline License Validation

CredStore commercial licenses use asymmetric digital signatures. The licensing server holds a
private signing key and signs a compact license payload containing fields such as plan, features,
account identity, issue time, expiry, user limits, device limits, and license ID.

The offline application embeds only the public verification key. The client decodes the base64 or
QR license token, verifies the signature locally, and enforces plan rules without contacting the
server. A forged or modified license fails verification because the attacker does not have the
private signing key.

Production builds should avoid storing the public key as an obvious replaceable string. Public-key
fragments may be reconstructed in memory during verification and cleared after use. This is an
obfuscation layer, not a replacement for platform code signing.

## Binary Integrity and Runtime Hardening

CredStore production releases should use platform-native signing:

- Android App Signing or APK signing schemes;
- Apple code signing and notarization where applicable;
- Windows Authenticode signing;
- Linux package signatures where distribution channel supports them.

The application may also verify packaged asset hashes with SHA-256 manifests and perform
release-only runtime checks for debugger, tracing, root, jailbreak, or instrumentation indicators.
These controls raise attacker cost but cannot make an offline binary unbreakable on a fully
compromised endpoint.

## Vulnerability Reporting

Security reports may be sent to:

`donnamariealive@web-library.net`

Replace this address with the correct production security contact before publication. Please include
affected version, platform, reproduction steps, expected impact, and any proof-of-concept material
that does not expose third-party data.

