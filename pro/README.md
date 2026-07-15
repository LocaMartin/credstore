# CredStore Pro / Enterprise

This directory is reserved for proprietary Pro and Enterprise features that should not be redistributed under the AGPLv3
community license.

Current public app code contains only the offline license-verification foundation, profile metadata foundation, and
community sync limits. Future paid-only implementations should live here and be governed by `../LICENSE-PRO.md`.

Planned Pro/Enterprise-only areas:

- Enterprise sync over more than 5 devices.
- Employee profile workflows beyond local metadata storage.
- Admin visibility controls and hierarchy policy enforcement.
- Corporate customization and support hooks.

Do not put private license signing keys in this repository. License generation must happen in the Cloudflare Worker with
`LICENSE_PRIVATE_JWK` configured as a Worker secret.
