# Repository License Configuration

Effective date: July 14, 2026

This repository uses a dual-license architecture:

- Public repository code: GNU Affero General Public License version 3 or later.
- Closed-source Pro and Enterprise code: commercial EULA in `LICENSE-PRO.md`.

This note is operational guidance, not legal advice.

## Transition From MIT to AGPLv3

1. Replace the root `LICENSE` file with the full AGPLv3 license text.
2. Add a clear license section to `README.md` stating that the public code is AGPLv3-or-later.
3. Keep proprietary code in a clearly marked directory such as `/pro` or `premium/pro`.
4. Add `LICENSE-PRO.md` for the commercial terms that govern closed-source Pro code.
5. Make each source file header consistent where practical:
   `SPDX-License-Identifier: AGPL-3.0-or-later`.
6. For commercial-only files, use a proprietary header:
   `SPDX-License-Identifier: LicenseRef-CredStore-Commercial`.
7. Confirm that every contributor has agreed that their contributions may be relicensed from MIT
   to AGPLv3. If not, keep their contribution under its original license or obtain written consent.
8. Update package metadata, website copy, release notes, and distribution bundles so buyers and
   downstream users see the correct license before use.

## Commercial Boundary

The AGPLv3 license applies to the public repository code unless a file explicitly says otherwise.
The commercial EULA applies only to proprietary Pro or Enterprise code and commercial binaries.

Do not mix private signing keys, private license generators, customer records, or commercial-only
source code into AGPLv3 public releases.

