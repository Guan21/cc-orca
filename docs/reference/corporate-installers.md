# Secure Orca Lite Corporate Installers

Issue #24 corporate packages are built from the same source tree as default Orca, but with
`ORCA_BUILD_PROFILE=corporate` pinned for the full desktop build and electron-builder package
step.

## Local/Test Builds

Windows:

```powershell
pnpm run build:win:corporate
```

Expected local artifact:

```text
dist/secure-orca-lite-windows-setup.exe
```

macOS:

```bash
pnpm run build:mac:corporate
```

Expected local artifacts:

```text
dist/secure-orca-lite-macos-arm64.dmg
dist/secure-orca-lite-macos-arm64.zip
dist/secure-orca-lite-macos-x64.dmg
dist/secure-orca-lite-macos-x64.zip
```

The macOS command uses the existing local macOS build path, including local build-version
stamping. Build output depends on the host and installed native toolchains. Runtime validation for
x64 still requires an Intel Mac or a valid x64 execution environment.

## Product Identity

Default packaging remains unchanged:

```text
Product: Orca
App ID: com.stablyai.orca
Windows installer: orca-windows-setup.exe
macOS DMG: orca-macos-${arch}.dmg
```

Corporate packaging defaults to a generic public-safe identity so it can coexist with upstream
Orca:

```text
Product: Secure Orca Lite
App ID: dev.orca.secure-lite
Windows installer: secure-orca-lite-windows-setup.exe
macOS DMG: secure-orca-lite-macos-${arch}.dmg
```

Corporate packagers can override the public-safe defaults without changing source:

```bash
ORCA_CORPORATE_PRODUCT_NAME="Secure Orca Lite Preview" \
ORCA_CORPORATE_APP_ID="dev.example.secure-orca-lite-preview" \
pnpm run build:mac:corporate
```

PowerShell:

```powershell
$env:ORCA_CORPORATE_PRODUCT_NAME = 'Secure Orca Lite Preview'
$env:ORCA_CORPORATE_APP_ID = 'dev.example.secure-orca-lite-preview'
pnpm run build:win:corporate
```

Do not commit company domains, hostnames, account IDs, certificates, passwords, or internal
distribution settings.

## Profile Guarantee

The corporate package scripts set `ORCA_BUILD_PROFILE=corporate` before any desktop build or
electron-builder packaging step runs. The electron-builder `afterPack` hook stamps the packaged CLI
metadata with `orcaBuildProfile`. A packaged corporate CLI treats that marker as monotonic: runtime
environment variables cannot downgrade it to `default`.

## Production Signing Requirements

Local/test Windows installers may be unsigned. Users should expect Windows SmartScreen or unknown
publisher warnings for unsigned local artifacts.

Production Windows distribution requires the existing SignPath-based signing flow or equivalent
Authenticode signing for:

- packaged PE binaries inside `dist/win-unpacked`
- the NSIS uninstaller captured by the existing electron-builder sign hook
- the final NSIS installer

No signing tokens, certificates, or private keys belong in the repository.

Local/test macOS builds may be ad-hoc or unsigned. Gatekeeper may block or warn on first launch,
especially when the artifact is copied between machines.

Production macOS distribution requires:

- Developer ID Application certificate (`CSC_LINK`, `CSC_KEY_PASSWORD`)
- Apple notarization credentials (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`)
- hardened runtime enabled through `ORCA_MAC_RELEASE=1`
- notarization and stapling performed by electron-builder's release path

Use `pnpm run build:mac:release` for the existing production macOS release path after the required
credentials are present. To produce a production corporate macOS package, run the same release path
with `ORCA_BUILD_PROFILE=corporate` and any public-safe corporate identity overrides supplied by
the secure build environment.
