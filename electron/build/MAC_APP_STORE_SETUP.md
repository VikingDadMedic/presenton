# Mac App Store Setup

This project is configured for Mac App Store signing with App Sandbox.

## Files added for MAS

- `build/entitlements.mas.plist`: main app entitlements (sandbox + network + file dialogs).
- `build/entitlements.mas.inherit.plist`: inherited entitlements for helpers/binaries.
- `scripts/sign-mas.js`: manual signing helper using `@electron/osx-sign`.

## Files you need from Apple and where to get them

1. Apple Development certificate
   - Get from Xcode: Settings/Preferences -> Accounts -> your team -> Manage Certificates -> Add Apple Development.

2. Apple Distribution certificate
   - Get from Xcode: Settings/Preferences -> Accounts -> your team -> Manage Certificates -> Add Apple Distribution.

3. Provisioning profile for development testing
   - Get from Apple Developer Portal: Certificates, Identifiers & Profiles -> Profiles -> create a macOS App Development profile for your app ID.
   - Download the `.provisionprofile` file and keep its local path.

4. App ID (Bundle ID)
   - Create in Apple Developer Portal: Identifiers -> App IDs.
   - Must match this app's bundle ID (`appId` in `build.js`).

## Step 6 (from the guide): create two provisioning profiles

Step 6 requires both profiles below. Put both files in `electron/build`.

1. AppleDevelopment profile (for MAS development testing)
  - Apple Developer Portal -> Certificates, Identifiers & Profiles -> Profiles -> Add (+)
  - Profile type: macOS App Development
  - App ID: your app id
  - Certificate: Apple Development
  - Save as `AppleDevelopment.provisionprofile`
  - Place at `electron/build/AppleDevelopment.provisionprofile`

2. MacAppStore profile (for MAS submission build)
  - Apple Developer Portal -> Certificates, Identifiers & Profiles -> Profiles -> Add (+)
  - Profile type: Mac App Store
  - App ID: your app id
  - Certificate: Apple Distribution
  - Save as `MacAppStore.provisionprofile`
  - Place at `electron/build/MacAppStore.provisionprofile`

Verify profile contents and expiration:

- `security cms -D -i build/AppleDevelopment.provisionprofile`
- `security cms -D -i build/MacAppStore.provisionprofile`

## Build commands

From `electron/`:

- Build default mac artifact (dmg):
  - `npm run dist`

- Build MAS development target:
  - `MAS_DEV_IDENTITY="Apple Development" npm run dist:mas:dev`

- Build MAS distribution target:
  - `MAS_IDENTITY="Apple Distribution" npm run dist:mas`

Notes on profile selection:

- By default, the build uses `build/AppleDevelopment.provisionprofile` for `mas-dev`.
- By default, the build uses `build/MacAppStore.provisionprofile` for `mas`.
- Override with env vars when needed:
  - `MAS_DEV_PROVISIONING_PROFILE=/custom/path/AppleDevelopment.provisionprofile`
  - `MAS_PROVISIONING_PROFILE=/custom/path/MacAppStore.provisionprofile`

## Optional manual signing with @electron/osx-sign

If you need to sign an already built `.app` directly:

- Development signing:
  - `MAS_APP_PATH="dist/mas-dev-arm64/Presenton Open Source.app" npm run sign:mas:dev`

- Distribution signing:
  - `MAS_APP_PATH="dist/mas-arm64/Presenton Open Source.app" npm run sign:mas`

## Notes

- MAS-signed apps require the MAS Electron build. The `mas` and `mas-dev` targets handle that.
- Apps signed with Apple Distribution usually do not run locally; they run after App Store processing.
- Development signed apps only run on devices included by your provisioning profile.
- Provisioning profiles expire (typically yearly). Regenerate and replace them when expired.
- For macOS App Store packaging, place `icon.icns` at `electron/build/icon.icns`.