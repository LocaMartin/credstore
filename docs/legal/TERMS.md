# CredStore Terms of Service

Effective date: July 14, 2026

These Terms of Service ("Terms") govern access to and use of CredStore websites, downloads,
license services, documentation, and software. These Terms are a template and should be reviewed by
qualified counsel before production use.

## 1. Acceptance

By downloading, installing, purchasing, activating, or using CredStore, the user or organization
accepts these Terms and any applicable open-source or commercial license terms.

If a signed enterprise agreement applies, that agreement controls where it conflicts with these
Terms.

## 2. Offline Product Responsibility

CredStore is a fully offline credential manager. The user controls the device, local vault files,
master keys, biometric settings, backups, local sync, and recovery process.

CredStore does not provide cloud recovery, hosted password storage, server-side master-key reset,
or emergency access unless a separate product feature expressly states otherwise.

## 3. User Duties

The user is solely responsible for:

- creating and remembering master keys;
- protecting devices, operating systems, biometric enrollment, and local storage;
- maintaining tested backups of vault files and recovery material;
- verifying sync results before deleting source data;
- complying with workplace, regulatory, export, and sector-specific security requirements;
- testing CredStore before production deployment.

## 4. No Recovery Guarantee

If a master key is forgotten, a biometric profile is removed, a vault key is deleted, a local file is
corrupted, or all backups are lost, CredStore may be unable to recover the vault. This limitation is
a direct result of the zero-knowledge architecture.

## 5. Software Provided As Is

CredStore is provided "as is" and "as available." To the maximum extent permitted by law, CredStore
disclaims all warranties, express, implied, statutory, or otherwise, including warranties of
merchantability, fitness for a particular purpose, non-infringement, security outcome, uninterrupted
operation, error-free operation, data preservation, regulatory suitability, or compatibility with
every device, biometric sensor, Bluetooth stack, operating-system version, or enterprise policy.

## 6. Limitation of Liability

To the maximum extent permitted by law, CredStore, Loca Martin, contributors, licensors, and
service providers will not be liable for:

- data loss, vault loss, credential loss, or local file corruption;
- forgotten master keys, failed biometric unlock, failed sync, or failed backups;
- unauthorized local access caused by device compromise, weak passwords, malware, root,
  jailbreak, debugging, or unsafe device configuration;
- business interruption, corporate downtime, lost revenue, lost profits, loss of goodwill,
  incident-response costs, or procurement of substitute services;
- indirect, incidental, consequential, special, punitive, or exemplary damages.

The user's sole responsibility is to maintain secure devices, strong master keys, and tested
backups. The user's sole remedy for dissatisfaction is to stop using CredStore.

Where liability cannot be fully excluded, total aggregate liability will not exceed the amount paid
for the relevant CredStore license during the twelve months before the claim.

## 7. Local Sync

CredStore local sync features are intended to transfer encrypted vault data between user-controlled
devices by local mechanisms such as Bluetooth or one-time QR codes. The user must verify that the
receiving device is trusted before syncing. CredStore is not responsible for sync to the wrong
device, interrupted sync, duplicate records, merge conflicts, user deletion, or local transport
failure.

## 8. Biometric Unlock

Biometric unlock depends on operating-system APIs, enrolled biometrics, hardware sensors, platform
security modules, and user device configuration. Biometric availability and reliability may vary by
device and platform. The user should keep a master-key recovery path available.

## 9. Commercial Licenses

Commercial Pro and Enterprise features are licensed, not sold, and are subject to the commercial
EULA in `LICENSE-PRO.md` or a signed enterprise agreement. Unauthorized license sharing,
decompilation, tampering, reverse engineering, or redistribution is prohibited.

## 10. Open Source License

Public CredStore repository code is licensed under AGPLv3-or-later unless a file states otherwise.
Users who modify and provide network access to AGPL-covered versions must comply with AGPLv3 source
availability obligations.

## 11. Termination

CredStore may terminate access to commercial services, future updates, support, or license issuance
if the user violates these Terms, violates the EULA, abuses license keys, attacks infrastructure, or
uses the software unlawfully.

## 12. Changes

CredStore may update these Terms. Continued use after publication of updated Terms means acceptance
of the updated Terms, except where a signed enterprise agreement states otherwise.

