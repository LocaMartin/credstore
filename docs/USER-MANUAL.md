# CredStore User Manual

CredStore is an offline credential manager for storing passwords, API keys, tokens, account notes, and other secrets in
an encrypted local vault.

## Create a Vault

1. Open CredStore.
2. Enter a new master password.
3. Use a long, unique password that includes lowercase letters, uppercase letters, numbers, and symbols.
4. Unlock once to create the encrypted vault.

CredStore has no recovery server and no master-key escrow. If every master key is forgotten, the vault cannot be
recovered.

## Unlock

Enter any enabled password master key to unlock the vault. After repeated failed attempts, CredStore applies a local
lockout delay to slow guessing.

On supported platforms, biometric unlock can be registered after the vault is created. Biometric unlock stores only
protected vault-key material. The operating system performs the fingerprint, Touch ID, or face authentication prompt.

## Add Credentials

Use Add to create a credential. A credential can contain any number of fields, including username, password, URL, API
secret, database password, recovery code, token, or custom labels.

Mark sensitive fields as secret so they stay masked until copied or revealed. Notes are stored inside the encrypted
vault with the rest of the credential.

## Edit and Delete

Open a saved credential to edit fields, notes, and category. Delete removes the credential from the local vault.

On desktop, right-click a credential to enter selection mode. On Android, long-press a credential. Selection mode supports
Select All, Sync Selected, Delete Selected, and Clear.

## Master Keys

Settings contains the Master Keys section. Add a backup password before relying on a single unlock path.

Password master keys wrap the same random vault key. Removing a password key deletes that unlock path, but does not
delete the encrypted credential data as long as another enabled key remains.

## Biometric Unlock

Register Fingerprint, Touch ID, or Face unlock from Master Keys. Fingerprint and Touch ID use the operating system's
biometric/key-release bridge. Face unlock uses hardware-backed OS face authentication where available and falls back to a
local camera face-template check on devices with a camera.

Linux fingerprint unlock and Windows Hello unlock remain disabled until their native bridges are implemented and tested.

## Local Sync

CredStore sync is offline and device-to-device.

1. Unlock the sending device.
2. Choose Client to create a short pairing QR and OTP.
3. Unlock the receiving device.
4. Choose Receiver and scan the pairing QR, or type the OTP if the receiver has no camera.
5. Start the receiver, then send the encrypted payload over the local channel.
6. Review the confirmation after import.

The QR/OTP is only a pairing code. It does not contain the vault. Android and iOS use the native local Bluetooth bridge.
Desktop builds use local Wi-Fi/LAN discovery and TCP payload transfer through the Electron native bridge.

Sync merges missing or newer records and does not erase receiver-only data. Community sync supports up to 5 local sync
devices.

## Enterprise License

The Enterprise tab accepts signed offline license tokens. A valid license can raise device and user limits without
contacting a cloud vault.

Trial and enterprise licenses include clock rollback protection. Keep the device clock accurate before validating a
license.

## Backup

CredStore does not operate cloud backup. Keep your own encrypted backups or sync copies on devices you control.

Before resetting or uninstalling, sync or back up anything you still need. Reset and uninstall cleanup are destructive.

## Reset

Use Settings, Danger Zone, Reset to delete local vault storage and native biometric key material. The reset action is for
starting fresh when you no longer need the current local vault or cannot unlock it.

After reset, CredStore reloads and starts from an empty vault state.

## Uninstall

For the npm desktop launcher, remove the global package:

```bash
npm uninstall -g credstore
```

Current npm versions do not reliably run package uninstall lifecycle scripts. CredStore clears stale desktop
vault/authentication state automatically during the next install, and Windows NSIS builds request app-data deletion during
uninstall. Android removes the app sandbox during uninstall and checks for restored stale state after reinstall. iOS can
retain Keychain items after uninstall, so CredStore clears retained biometric keychain entries on first launch after
reinstall.
