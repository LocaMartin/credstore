# CredStore Admin Manual

CredStore Enterprise controls are local-only administration tools. They do not contact a cloud service and they do not
give CredStore any recovery access to vault data.

## Admin Authentication

1. Open Settings, then switch to Enterprise.
2. Set an admin password before changing employees, groups, or credential visibility.
3. Optionally generate the Offline Authenticator QR and scan it in an authenticator app.
4. Enter the 6-digit authenticator code to verify setup or to unlock admin controls later.

Admin authentication is stored inside the encrypted vault. If the vault is reset or lost, admin configuration is lost too.

## Enterprise License

1. Paste or scan a signed enterprise license token.
2. Select Validate Offline License.
3. CredStore verifies the license signature locally with the embedded public key.

Community mode allows 5 sync devices. A signed enterprise license raises the offline device and user limits.

## Employee Profiles

Use employee profiles to separate who owns a credential.

1. Add an employee profile name.
2. Optionally select an existing project group.
3. Select Add.

New credentials are assigned to the active profile unless an admin changes ownership.

## Project Groups

Project groups let an admin share credentials with a team instead of one person at a time.

1. Enter a project group name.
2. Select Create Group.
3. Use the checkboxes under the group to add or remove employee profiles.

## Visibility Control

Use Hierarchical Visibility Control to decide who can see a credential.

1. Select the credential.
2. Select the owner profile.
3. Check visible employees or visible project groups.

Owner access and visible access are stored as encrypted vault metadata. Sync merges these rules with the credential data.

## Recovery Limits

CredStore has no server-side admin override. If every master key and admin credential is lost, the vault cannot be
recovered. Keep a separate encrypted backup of critical vault exports.
