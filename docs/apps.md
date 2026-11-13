# Building Curvelet

One web build (`apps/web/dist`) runs everywhere: as an installable web app, inside the iOS and Android apps (Capacitor), and inside the desktop app (Tauri). Every file ships with the app, including the symbolic engine (Pyodide and SymPy), so nothing is downloaded at run time.

## Web (installable, offline)

```bash
npm run build:web
```

Upload `apps/web/dist` to any static host over HTTPS. Paths are relative, so it also works from a sub-folder. The service worker (`sw.js`) stores the app on the first visit and the symbolic engine the first time it loads; after that the app opens without a connection. When a new version is uploaded, open copies show "A new version is ready" with a button to reload.

Share links from the iOS, Android and desktop apps point at the web version. Set its address when building:

```bash
VITE_PUBLIC_URL=https://example.com/calculator/ npm run build:web
```

Without it, Share in the apps offers to save a file instead.

## Desktop (macOS, Windows, Linux)

Needs Rust (installed here through Homebrew).

```bash
npm run build:desktop
```

Output: `apps/desktop/src-tauri/target/release/bundle/` (`macos/Curvelet.app` and `dmg/Curvelet_0.1.0_aarch64.dmg` on an Apple silicon Mac). Windows installers are built on Windows with the same command.

**On this Mac:** the Command Line Tools linker (26.6) is older than the newest SDK installed with it (27.0) and can't read it. Until the tools are updated, build against the 26.5 SDK:

```bash
SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk npm run build:desktop
```

The app is signed ad hoc, which is enough to run it on this Mac. To give it to others, sign it with a Developer ID certificate and notarize it, or submit it to the Mac App Store.

## Installers from GitHub (Windows, macOS, Linux)

`.github/workflows/desktop.yml` builds the desktop installers on GitHub's machines, after running the tests:

| Platform | Files |
|---|---|
| Windows (x64) | `.exe` (NSIS) and `.msi` |
| macOS (Apple silicon, Intel) | `.dmg` |
| Linux (x64) | `.deb`, `.rpm`, `.AppImage` |

- **By hand:** on GitHub, Actions → Desktop apps → Run workflow. When it finishes, the installers are under "Artifacts" on the run's page
- **For a release:** raise the version in `apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/src-tauri/Cargo.toml` and `apps/desktop/package.json`, commit, then push a tag with the same number. The run is never cancelled, and publishes a release in the public [aylynuw/curvelet-releases](https://github.com/aylynuw/curvelet-releases) repository (this one is private) with every installer and `latest.json`:

```bash
git tag v0.2.0
```

```bash
git push origin v0.2.0
```

### Updates in the installed app

From 0.2.0 the desktop app checks `https://github.com/aylynuw/curvelet-releases/releases/latest/download/latest.json` a few seconds after it starts. When a newer version is listed it offers "Update and restart"; the update is downloaded, its signature checked against the public key in `tauri.conf.json`, installed and the app restarts. With no connection it says nothing and checks again next start. Versions before 0.2.0 have no updater, so 0.2.0 is installed by hand once.

Two repository secrets make this work:

| Secret | What it is |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` (and `…_PASSWORD`, empty) | Signs the update files. The key file is `~/.tauri/curvelet.key` on the Mac it was made on, with a copy beside it. Keep a copy somewhere safe too: without it, installed apps can never be updated again (a new key needs a manual reinstall everywhere) |
| `RELEASES_TOKEN` | A fine-grained GitHub token with read and write access to the contents of `curvelet-releases` only, so the build can publish there |

Set the repository variable `PUBLIC_URL` (Settings → Secrets and variables → Actions → Variables) to the web address, so share links from the installed app work.

The builds aren't signed yet: Windows shows a SmartScreen warning and macOS asks to confirm opening. Signing needs an Apple Developer ID and a Windows code-signing certificate, added later as repository secrets.

## iOS and Android

```bash
npm run build:mobile   # builds the web app and copies it into both native projects
```

- **iOS:** needs Xcode (from the App Store; this Mac has only the Command Line Tools). Then `npm run ios --workspace @math/mobile` opens the project; choose a team under Signing, then Run, or Product → Archive for the App Store
- **Android:** needs Android Studio (it brings the Android SDK and Java). Then `npm run android --workspace @math/mobile` opens the project; Run, or Build → Generate Signed Bundle for Google Play

Icons, the launch screen and the adaptive Android icon are already in both projects.

## Before release

- App IDs: `com.curvelet.app` (in `apps/mobile/capacitor.config.json`) and `com.curvelet.desktop` (in `apps/desktop/src-tauri/tauri.conf.json`). They can't change after the first store upload; if you don't own curvelet.com, change them to your domain before then
- Store text, screenshots to take and the privacy policy: [store/listing.md](store/listing.md), [store/privacy.md](store/privacy.md)
