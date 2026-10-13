# Issue 126 validation

Application source: `fc29ba4b366cbd72e1d8f39442626de6028b18ef`.
Subsequent commits relocate/record acceptance documentation only; application
and package inputs have no diff from this source commit.

## Automated and package outcomes

| Check                                                                                           | Outcome  | Evidence                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Corporate preset/custom icons, Settings rendering/drafts, external editor launches              | PASS     | 66 tests; icon regression first failed on remote images/preloads                                                                                                                      |
| Renderer observer, proxy/certificate/preview regression suites                                  | PASS     | 50 tests; listener replacement and WS/WSS failures first reproduced                                                                                                                   |
| Corporate network/build policy, Settings support/update, static scanner and packaging contracts | PASS     | 124 tests                                                                                                                                                                             |
| Generated Corporate build profile and branding contracts                                        | PASS     | 7 tests                                                                                                                                                                               |
| Node, CLI, renderer typecheck                                                                   | PASS     | All three projects exited 0; checks serialized/bounded after host memory contention                                                                                                   |
| Lint/format                                                                                     | PASS     | Targeted oxlint/oxfmt and actual pre-commit normal/React Doctor lint                                                                                                                  |
| Static endpoint scanner                                                                         | PASS     | 12,348 files; zero new forbidden endpoints; no baseline expansion                                                                                                                     |
| Native Electron modules                                                                         | PASS     | Patched process ownership/CreationTime probes; process-tree import inspection clean                                                                                                   |
| Corporate NSIS build                                                                            | PASS     | `pnpm run build:win:corporate`, exit 0                                                                                                                                                |
| Packaged integrity                                                                              | PASS     | 2,277 ASAR files; patched ConPTY ownership, daemon-entry and plugin-resource checks                                                                                                   |
| Installed Windows 10 VM retest (scoped #126)                                                    | **PASS** | Normal install/start/hydration, Settings request/observer checks and VM cleanup verified; [final native record](https://github.com/Guan21/cc-orca/issues/126#issuecomment-6145003669) |

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

## Native gate — final scoped PASS

**Superseding result:** [#126 installed Windows native acceptance](https://github.com/Guan21/cc-orca/issues/126#issuecomment-6145003669) is **PASS for the explicitly tested Settings scope**. The earlier VM-lock reports remain valid historical attempts but are no longer the current release-blocking result. See [native-retest.json](./native-retest.json) for a sanitized machine-readable summary.

- **Exact built source:** `fc29ba4b366cbd72e1d8f39442626de6028b18ef`. The final pre-reconciliation PR head `78ad1652a222e912322de3b8c0fb190ca06ff2d4` differed only in `docs/acceptance/issue-126/` evidence/harness paths, not production/package inputs.
- **Installer:** SHA256 `CD5AB0B5B0E5DBDC2921DBB08173D29F8B732982E28D79418605569EBD8E8AB5`, 180,676,935 bytes, Corporate DevCrew 1.4.197, **NotSigned** for local testing. NSIS exit 0; installed EXE SHA256 `BCF7303807570C683979217BA1BE1672B283CF8626F7213E12C02D34507A738A` and installed ASAR SHA256 `4D2ACC35A212DDA9B65FE5C2DAC4D48E547B1A2E16D9E7EB775AC77AEFC79BB4` matched.
- **Startup/security:** ordinary installed production startup and renderer hydration PASS. Packaged sandbox and context isolation enabled, Node integration disabled. Corporate telemetry, Linear/Jira preload capabilities denied; an unauthorized Cursor `pty.spawn` was denied.
- **Settings/UI:** two complete Settings open/close cycles, preset/local SVG icons and an unsaved custom draft PASS. Roughly 153 seconds of scoped interaction and idle observation. **Independent CDP captured zero HTTP(S)/WebSocket requests in this Settings scope**, including zero Google/gstatic images; nine runtime observer records included zero external destinations. A controlled loopback request was independently seen by CDP and attributed by the renderer observer.
- **Important semantics:** the controlled loopback transfer **completed**. The runtime decision `disabled` with reason `automatic_app_egress_requires_explicit_enablement` is a logging/classification field, **not** evidence of a transport block. Controlled sensitive query strings were absent from 21 emitted JSON/JSONL evidence files.
- **Screenshot limitations:** startup and second-cycle screenshots timed out, recorded **BLOCKED**. First-cycle/menu/draft screenshots and both-cycle DOM/network evidence support the _scoped_ acceptance. No broader full-UI screenshot PASS is asserted.
- **Cleanup:** VM normal poweroff verified; only the temporary `DevCrew126Output` share removed after shutdown. Four snapshots and the original read-only share preserved.
- **Not exercised:** OS-wide and all-process egress, full startup-wide network audit, every provider/Linear/Jira endpoint, SSH, all allowlist combinations and macOS ARM64.

Earlier attempts included account-unlock BLOCKED, diagnostic launch timeout, unsupported keyboard shortcut from restored Project Map, screenshot timeout, and a persisted Settings view. The final privately retained diagnostic is `attempt-5`; a separate ordinary startup is recorded as `ordinary-final`. These limitations and attempts are not discarded.

### Passing harness provenance — reconciled

See [harness-reconciliation.md](./harness-reconciliation.md) and
[harness-provenance.json](./harness-provenance.json) for the retained staged script
hashes, exact execution chains, private evidence relationship and differences
from the final tracked harness. Hashes are retrospective, not launch-time attestations.
The retry wrapper did not propagate failures in the executed copy; probe exit and
cleanup artifacts independently support the PASS. The tracked retry wrapper now
propagates failure; screenshot handling now distinguishes timeouts from other errors.
Those final tightenings were not native-rerun. No production code or package changed.

## CI and disposition

- **PASS** at prior reviewed PR HEAD `78ad1652a222e912322de3b8c0fb190ca06ff2d4`: [full PR Checks](https://github.com/Guan21/cc-orca/actions/runs/38365820590), [PR test LoC](https://github.com/Guan21/cc-orca/actions/runs/38365820298), all eight test shards, Windows/Linux packaging, static analysis, typecheck and aggregate verify. Conditional jobs (including CI E2E) skipped.
- Separate earlier application-equivalent revision `042f60eb83340644cdb024d6e38fafef23e0ecd3` also had [full checks PASS](https://github.com/Guan21/cc-orca/actions/runs/38363807226). Neither set of checks by itself establishes native Windows PASS.
- The **current documentation reconciliation** on this PR branch is newer than the earlier CI SHA. Wait for new HEAD checks before merge; do not attribute previous CI to this new documentation commit.
- [Community tracker workflow failure](https://github.com/Guan21/cc-orca/actions/runs/38363597558) concerned a missing third-party GitHub App private-key secret, not the #126 fix. No credential or security-policy bypass.
- [PR #127](https://github.com/Guan21/cc-orca/pull/127) remains subject to final review and harness version-alignment before merge. [Issue #126](https://github.com/Guan21/cc-orca/issues/126) stays open until the PR review/merge disposition is decided. [#119](https://github.com/Guan21/cc-orca/issues/119) and Phase 2 remain open.
- Scoped Settings zero-request PASS is **not** a system-wide egress certification, a signing approval or a production release approval.
