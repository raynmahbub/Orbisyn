# Native client shells

Orbisyn shares the React storefront across native shells while keeping platform
permissions and distribution in platform projects:

- `apps/mobile/ios` is the Capacitor iOS application (iOS 15+).
- `apps/mobile/android` is the Capacitor Android application (min SDK is set by
  the Capacitor template; build with the Android SDK/Gradle wrapper).
- `apps/desktop/src-tauri` is the Tauri 2 desktop application for Windows,
  macOS and Linux.

The shared UI is compiled from `apps/web`. Native shells include that build and
use the Settings screen's **Gateway URL** to connect to a self-hosted Orbisyn
instance. Enter the gateway origin (for example `https://orbisyn.example.org`),
save, and reconnect. The client appends `/api` for API requests. HTTPS is
required for production deployments; do not disable platform transport security
to make an unencrypted remote gateway work.

## Build workflow

Requires Node 22+. Mobile builds additionally require Xcode 16+ on macOS for
iOS, and Android Studio/SDK plus a JDK for Android. Desktop builds require Rust
and the native toolchain listed in the Tauri prerequisites for the target OS.

```sh
npm ci
npm run mobile:build
npm run mobile:open:ios       # macOS only
npm run mobile:open:android   # Android Studio
npm run desktop:dev
npm run desktop:build
```

`mobile:build` builds the shared web client and copies it into both native
projects. After changing the web app, rerun it before opening Xcode or Android
Studio. Signing, provisioning, store listings and release credentials remain
maintainer responsibilities; this repository does not contain signing keys.

## Gateway CORS

A mobile or desktop webview connecting to a different origin must be allowed by
the gateway's `GATEWAY_CORS_ORIGINS`. Include the application origins used by
Capacitor (`capacitor://localhost`, `https://localhost`) and Tauri
(`tauri://localhost`, `http://tauri.localhost`, `https://tauri.localhost`) as
needed by the OS. CORS is not authentication; never treat an allowed origin as
an authorization boundary. Same-origin hosted web deployments need no extra
CORS entry.

## Platform boundary

These shells provide native lifecycle/back handling and open upstream links in
the platform browser. They do **not** silently install arbitrary packages. iOS
only permits software distribution through Apple-approved mechanisms, and
Android/desktop install or update operations still need independently reviewed,
platform-specific download verification, consent, permission, signature and
rollback flows. The UI must continue to label handoffs accurately until those
install agents exist.
