# DevCrew Corporate Branding Compatibility Allowlist

DevCrew is the corporate product name for user-visible surfaces. The identifiers below intentionally keep legacy DevCrew spellings because changing them would break existing installs, state, protocols, or command compatibility.

## Retained Internal Compatibility

- `com.stablyai.orca`, `dev.orca.secure-lite`: Electron app ids and existing local/corporate build compatibility contracts. Changing them would split update identity, app data, and OS permissions from existing installs.
- `orca://`: Deep-link protocol scheme used by pairing and existing links. Keep the scheme while presenting the protocol name as DevCrew.
- `orca`, `orca.cmd`, `orca.exe`, `orca-ide`: Public CLI names and packaged CLI shims. Existing shells, scripts, SSH hosts, Linux conflict handling, and PATH registration depend on these names.
- `~/.orca`, `.orca`, `orca.yaml`, `orca-data.json`, `orca-runtime.json`, `orca-environments.json`, `refs/orca/*`: Persisted state, project config, runtime metadata, and migration inputs. Do not rename without an explicit migration plan.
- `ORCA_*` environment variables and build flags: Internal process contracts shared by build scripts, CLI, runtime, and diagnostics.
- `getOrca*`, `OrcaRuntime*`, `OrcaProfile*`, `OrcaHooks`, and similar type/API names: Internal implementation identifiers and wire/storage compatibility types.
- `Orca Computer Use.app`, `orca-notification-status`, `orca-keyboard-layout`: Existing helper bundle/executable names tied to native build outputs and signing paths. User-facing permission copy around them uses DevCrew.
- `Managed by DevCrew` plugin markers, `# DevCrew managed WSL CLI ...` launcher markers, and the DevCrew-generated zsh wrapper marker: Existing file recognition markers used to identify files created by older builds. Keep them so upgrades can still recognize and safely update those files.
- `DevCrew.MobilePairing`, `DevCrew` terminal truncation markers, and app-server client identity titles: Existing OS/protocol identifiers. Their surrounding display copy uses DevCrew where applicable.
- `orca-ide` Linux package/executable names: Retained to avoid GNOME DevCrew package conflicts and preserve Linux CLI/package compatibility.

## Replaced User-Visible Branding

Product-facing app, menu, tray, notification, About, titlebar, and primary package artifact names use DevCrew. Existing DevCrew icon artwork is retained as the DevCrew visual identity.
