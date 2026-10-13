# Issue 126 validation

Application source: `fc29ba4b366cbd72e1d8f39442626de6028b18ef`.
Subsequent commits relocate/record acceptance documentation only; application
and package inputs have no diff from this source commit.

## Automated and package outcomes

| Check | Outcome | Evidence |
| --- | --- | --- |
| Corporate preset/custom icons, Settings rendering/drafts, external editor launches | PASS | 66 tests; icon regression first failed on remote images/preloads |
| Renderer observer, proxy/certificate/preview regression suites | PASS | 50 tests; listener replacement and WS/WSS failures first reproduced |
| Corporate network/build policy, Settings support/update, static scanner and packaging contracts | PASS | 124 tests |
| Generated Corporate build profile and branding contracts | PASS | 7 tests |
| Node, CLI, renderer typecheck | PASS | All three projects exited 0; checks serialized/bounded after host memory contention |
| Lint/format | PASS | Targeted oxlint/oxfmt and actual pre-commit normal/React Doctor lint |
| Static endpoint scanner | PASS | 12,348 files; zero new forbidden endpoints; no baseline expansion |
| Native Electron modules | PASS | Patched process ownership/CreationTime probes; process-tree import inspection clean |
| Corporate NSIS build | PASS | `pnpm run build:win:corporate`, exit 0 |
| Packaged integrity | PASS | 2,277 ASAR files; patched ConPTY ownership, daemon-entry and plugin-resource checks |
| Installed Windows 10 VM retest | BLOCKED | Existing guest account locked at sign-in; staged installer hash verified, new build not installed/exercised |

The full changed-file type-aware audit was cancelled to free memory for the
headless guest after its normal scan reported zero findings. Required project
typechecks and targeted lint passed; CI static analysis passed separately.
The old broad egress E2E spec contains native focus/show operations and was not
run on the user's desktop. The staged native harness uses hidden CDP without
those operations.

The build needed a machine-local short MSBuild intermediate directory to avoid
Windows path-length failures. No tracked build-tool, dependency, or native source
was changed for that workaround.

## Package identity

See [build-manifest.json](./build-manifest.json) for exact source and installer,
executable, and ASAR SHA256 values. The 180,676,935-byte NSIS is a **NotSigned**
DevCrew 1.4.197 Corporate test installer. Local artifact:
`dist/devcrew-windows-setup.exe`. Retain the full build log privately.

## Native gate

See [native-retest.json](./native-retest.json). Normal installed startup,
Settings open/close/reopen/idle, independent CDP zero unexpected requests,
controlled renderer observer attribution, and installed restricted policy are
all **BLOCKED / NOT EXERCISED** for this new package. The previous Google/gstatic
native failure is not a pass for this fix. Zero records are not zero-egress proof.

The existing VM account must be unlocked through its normal access channel to
resume the staged retest. Earlier snapshots/evidence are retained. No password
guessing/reset or security-policy changes were used.

Cleanup is also blocked: normal ACPI shutdown was requested, but the VM still
reports running. VirtualBox's active session prevents removing the temporary
`DevCrew126Output` share. That share is restricted to this run's private output
directory. The original share and all snapshots remain unchanged. Complete normal
shutdown and remove only this temporary share after guest access is restored;
no forced poweroff was used.

## CI and disposition

PR: [#127](https://github.com/Guan21/cc-orca/pull/127), against `company-work`.
Application changes are narrow: reuse the local glyph and effective request
guards; remove the competing listener. Changed source files are
`open-in-app-catalog.tsx` and its new tests, observer installation and its tests,
proxy/certificate request guards, and ready-foundation startup.

[Code-equivalent revision CI](https://github.com/Guan21/cc-orca/actions/runs/38363807226)
**PASS**, including the aggregate verify job, root guard, static analysis,
typecheck, all eight test shards, and Windows/Linux package jobs, on
`042f60eb83340644cdb024d6e38fafef23e0ecd3`. A later documentation-only evidence
commit triggers a separate CI run; do not describe the earlier run as validating
that later SHA. The initial root-folder failure was corrected by relocating the
harness under `docs/`; the superseded run was cancelled.

[Community-tracking workflow](https://github.com/Guan21/cc-orca/actions/runs/38363597558)
failed because its GitHub App private-key secret is unavailable. This is an
external workflow configuration blocker; no credential/policy bypass was added.

Issue #126 remains open pending the native gate and final review. Issue #119 and
Phase 2 remain **OPEN**. No auto-merge or production release approval.
