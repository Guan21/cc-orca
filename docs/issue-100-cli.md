# Issue 100: CLI identity and compatibility

## Bounded cleanup plan

1. Audit shipped launchers, command installation, scripts, PATH registration and agent-facing usage.
2. Lock the existing package command and launcher paths with regression tests; require an additive DevCrew package alias to use the same dispatcher.
3. Improve DevCrew registration copy while retaining literal installed command names.
4. Run CLI and installer tests. Keep application launch, storage, SSH wire formats and Session History unchanged.

## Audit classification

| Finding | Class | Decision |
| --- | --- | --- |
| CLI registration copy mentions the product as a literal `orca` CLI | A | Identify the product as DevCrew and explain the compatibility command. |
| Package `bin.orca` | B | Preserve it and add `bin.devcrew` pointing at the same entrypoint. |
| macOS `/usr/local/bin/orca`, Apple Silicon `~/.local/bin/orca` | B | Preserve installed command discovery, ownership checks and safe registration. |
| Windows native `resources/bin/orca.exe` and `orca.cmd` | B | Preserve launcher forwarding and native argument safety. |
| Linux and WSL `orca-ide` | B | Preserve the command; bare `orca` can conflict with GNOME's screen reader. |
| Development `orca-dev`, `ORCA_*` environment variables | B | Preserve development isolation, host discovery and background launch contracts. |
| `src/main/cli/orca-*`, build script names and daemon identifiers | C | Internal names need no migration for this issue. |
| Agent guidance and command examples using `orca` | B | Still executable on packaged macOS/Windows; do not advertise a packaged `devcrew` command. |
| CLI `linear` command specs | D | Naming does not authorize Linear; retain Corporate capability checks. |
| Existing `orca` workspace/configuration directories | B | User data; never move or delete as a branding cleanup. |

## Command decision

`devcrew` is the canonical package-installed alias and `orca` remains supported. Both map to `out/cli/index.js`, so flags, worktree commands and runtime behavior are identical. `orca-dev` retains its isolated development profile.

Packaged application registration continues to use `orca` on macOS/Windows and `orca-ide` on Linux/WSL. Changing these names requires coordinated updates to transactional registration and removal, native Windows launcher build resources, WSL bridge reconciliation, AppImage stable launchers, terminal child PATH assembly and existing agent instructions. Introducing a second package resource without those updates would falsely advertise availability. This issue therefore preserves the proven installed command behavior and explains its compatibility name.

On Apple Silicon, the existing installer already falls back to the user-writable `~/.local/bin/orca` when `/usr/local/bin` is absent. Existing user shell commands and custom registration paths remain usable. No executable, PATH registration or user data is renamed.

## Verification limits

Windows can run dispatcher, branding and package contract tests. macOS symlink/runtime and M2 packaged acceptance checks require macOS; skipped tests are not acceptance evidence. The additive alias makes no network calls and changes no capability policy.

CLI validation on Windows: alias, branding, macOS-command-path, packaged-assets and existing CLI index suites yielded 45 passed tests and 25 explicitly skipped platform tests (four suites passed, one skipped). CLI TypeScript checking passed. Scoped Oxlint passed and Oxfmt formatted the changed CLI files and package manifest. Before implementation the package alias assertion failed because `bin.devcrew` was absent; it passes after the additive alias.
