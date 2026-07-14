# CredStore Zero-Knowledge Privacy Policy

Effective date: July 14, 2026

This Privacy Policy explains how CredStore handles information in connection with the CredStore
offline credential manager, license portal, and commercial billing flow.

This document is a template for publication and should be reviewed by qualified counsel before
enterprise customer use.

## 1. Zero-Knowledge Architecture

CredStore is designed as a fully offline, zero-knowledge credential manager.

CredStore does not operate a cloud vault, hosted password database, remote unlock service, or
server-side credential recovery system. User vault data remains on user-controlled devices unless
the user manually syncs it through local device-to-device mechanisms such as Bluetooth or one-time
QR codes.

The developer cannot access:

- saved passwords, passphrases, notes, cards, secrets, or credential metadata stored in a vault;
- master keys, recovery keys, vault encryption keys, or biometric key material;
- fingerprint templates, face templates, biometric scans, or operating-system biometric secrets;
- local sync payloads exchanged directly between user devices.

## 2. Information Processed Locally

The CredStore application may process the following data locally on the user's device:

- credentials and encrypted vault records entered by the user;
- master-key derivation material and encrypted vault-key slots;
- biometric unlock state returned by the operating system;
- local device identifiers used for offline sync limits or license binding;
- local audit, settings, theme, profile, and sync state.

This information is not transmitted to CredStore servers by the offline application.

## 3. Information Collected by the Website or Billing Flow

The CredStore website or payment flow may collect limited business and transaction information:

- buyer name or company name;
- email address;
- payment provider, transaction reference, payment status, and invoice metadata;
- plan, seat count, license type, and license issue date;
- customer-provided account identity or public license-binding identifier;
- support, complaint, or bug-disclosure messages voluntarily submitted through web forms.

Payment card and payment account details are processed by third-party payment providers such as
Stripe, PayPal, Razorpay, or similar processors. CredStore should not store full payment card
numbers or payment account credentials.

## 4. Offline License Generation

For paid licenses, the web server may use minimal billing and license metadata to create a signed
offline license token. The server signs the license payload with a private signing key and provides
the customer with a base64 license string, QR code, or license file.

The offline app verifies the license locally using the embedded public key. After issuance, ongoing
use of the license does not require CredStore to receive vault contents or online activation checks.

## 5. Legal Bases for Processing

For GDPR purposes, CredStore may process limited website and billing information under:

- contract necessity, to sell, issue, and support licenses;
- legitimate interests, to prevent fraud, handle support, maintain records, and secure services;
- legal obligation, to comply with tax, accounting, sanctions, and consumer-protection duties;
- consent, where optional marketing, bug-hall-of-fame publication, or non-essential cookies are
  used.

## 6. CCPA / CPRA Notice

CredStore does not sell user vault data because CredStore does not receive user vault data.

CredStore may collect identifiers, commercial information, internet or electronic network activity
related to the website, and support communications. These categories are used for billing, license
issuance, fraud prevention, support, security, legal compliance, and business operations.

California users may request access, deletion, correction, and information about processing where
applicable by contacting the privacy contact listed below.

## 7. Data Sharing

CredStore may share limited website and billing information with:

- payment processors;
- email, support, hosting, analytics, or security vendors;
- tax, accounting, legal, or compliance providers;
- law enforcement or regulators when required by valid legal process;
- business successors in a merger, acquisition, restructuring, or asset transfer.

CredStore does not share vault plaintext, master keys, biometric templates, or local sync payloads
because CredStore does not receive them.

## 8. Retention

Billing, invoice, and tax records may be retained for the period required by applicable law.
Support and complaint records are retained only as long as reasonably needed to resolve the request,
maintain security records, enforce licenses, or comply with legal obligations.

Users control local vault data retention on their own devices. Deleting the app or resetting device
storage may delete local vault data permanently if the user has no backup.

## 9. Security

CredStore uses administrative, technical, and organizational controls appropriate to the limited
website and billing information it processes. The application is designed so compromise of the
license portal should not expose user vault contents, because vault contents are not stored there.

No security system is perfect. Users remain responsible for device security, master-key strength,
backup hygiene, and safe storage of local vault files.

## 10. International Transfers

Website, billing, support, and infrastructure providers may process limited business data in
countries outside the user's location. Where GDPR applies, CredStore should use appropriate transfer
mechanisms such as standard contractual clauses or equivalent safeguards.

## 11. User Rights

Depending on location, users may have rights to access, correct, delete, restrict, object to, or
port personal information processed by CredStore's website or billing systems.

These rights do not allow CredStore to recover forgotten master keys or decrypt local vaults,
because CredStore does not possess the keys required to do so.

## 12. Contact

Privacy requests may be sent to:

`privacy@credstore.app`

Replace this address with the correct production privacy contact before publication.

