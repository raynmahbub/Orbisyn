# Documentation

| Document | What it covers |
| --- | --- |
| [storefront/](./storefront/README.md) | Orbisyn Store: routes, source mesh, local state, preview boundaries and QA |
| [architecture/overview](./architecture/overview.md) | How the pieces fit together, and where a change belongs |
| [architecture/gateway](./architecture/gateway.md) | The HTTP surface: routes, validation, errors, static client, lifecycle |
| [architecture/data-model](./architecture/data-model.md) | `AppRecord`, releases, artifacts, health scoring, identity |
| [architecture/configuration](./architecture/configuration.md) | Every environment variable, with defaults |
| [architecture/persistence](./architecture/persistence.md) | The `AppStorePort`, atomic file-backed state, backups, and single-instance limits |
| [architecture/sync-vault](./architecture/sync-vault.md) | Self-hosted end-to-end encrypted device pairing, vault API, and hosted-account limits |
| [architecture/native-clients](./architecture/native-clients.md) | Capacitor iOS/Android apps and Tauri Windows/macOS/Linux desktop shells |
| [architecture/testing](./architecture/testing.md) | Test layout, fakes, coverage policy, what is deliberately not tested |
| [providers/](./providers/README.md) | The provider contract, detection order, capability matrix |
| [protocol/osp](./protocol/osp.md) | The `osp://` scheme and the `orbisyn.json` manifest |
| [design/tokens](./design/tokens.md) | Colour, type, spacing and motion tokens, plus the accessibility rules |
| [adr/](./adr/README.md) | Decision records — why the system looks the way it does |

Two documents live outside this directory because they are read first:
[CONTRIBUTING.md](../CONTRIBUTING.md) for getting a checkout running, and
[SECURITY.md](../SECURITY.md) for reporting a vulnerability privately.
