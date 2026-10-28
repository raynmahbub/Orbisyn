# Cross-device sync vault

Orbisyn's web client can synchronize its persisted library state between devices
using a portable pairing code. This mode is self-hosted and end-to-end encrypted:

- The browser generates a 256-bit AES-GCM key and a separate high-entropy access
  credential. Neither is derived from or sent as a password.
- The persisted storefront state is encrypted in the browser before upload.
- The gateway stores the ciphertext, a SHA-256 hash of the access credential, a
  random vault id, and a compare-and-swap revision. It never receives the AES
  key and cannot inspect the library snapshot.
- The pairing code contains the vault id, access credential and AES key. Anyone
  who obtains it can read and change the vault, so share it only over a trusted
  channel. The browser keeps its own copy in local storage; an XSS compromise of
  that browser can access it.
- Each sync fetches the latest revision, decrypts it locally, performs a
  three-way field merge against the previous common snapshot, and retries if
  another device writes first. Simultaneous edits to the same scalar field use
  local-wins; independent fields and collection records merge separately.

## API and persistence

- `GET /api/sync-vaults/:id` returns an encrypted snapshot to a matching bearer
  credential.
- `PUT /api/sync-vaults/:id` creates or compare-and-swap updates a snapshot.
  The first write uses revision `0`; stale writes receive HTTP `409`.
- `ORBISYN_SYNC_VAULT_FILE` chooses the durable JSON sidecar, defaulting to
  `./var/orbisyn/sync-vaults.json`. Compose persists it in the `orbisyn-data`
  volume at `/data/sync-vaults.json`.

The file adapter is single-process and intended for modest self-hosted use, just
like the catalog store. Back up the data volume. Moving a vault requires its
pairing code; deleting local browser credentials does not delete the remote
ciphertext or revoke copies of codes already shared. Users who need revocation
should destroy the vault and create a new one.

## Scope and trust boundaries

This is **not** hosted account sync. It has no email identity, password reset,
OIDC login, account recovery, or central multi-tenant identity service. Loss of
the pairing code and all paired devices means the encrypted snapshot is
unrecoverable. The ordinary JSON backup remains useful for recovery but is not
end-to-end encrypted.

It also does not install or update native packages. Native iOS, Android and
desktop shells now package the shared storefront, but do not yet implement
platform-specific package verification, installer permissions, rollback or
automatic updates. Those flows still require separately reviewed platform
agents. Aurora/Play remains a local companion handoff; Orbisyn does not proxy
Play or collect store credentials. This environment lacks Xcode, Android SDK/JDK
and Rust/Cargo, so native binaries and signed installers have not been built or
validated here.
