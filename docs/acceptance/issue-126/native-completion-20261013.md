# Issue 126 installed Windows acceptance

Historical report from the native execution, before the later COMMENT review and
documentation reconciliation. Statements about PR HEAD, CI and review below are
as of that execution. See [harness-reconciliation.md](./harness-reconciliation.md)
for the current provenance assessment and tracked harness differences.

**PASS — scoped native acceptance. Issue #126 remains OPEN pending PR review.**

This supersedes the access blocker in the earlier recovery report. After the
operator closed the old VM processes, VirtualBox reported `aborted`; a headless
start reached the existing Windows desktop normally. No credentials, Windows
authentication settings, or Corporate network policy were changed.

## Exact artifact

| Item                         | Verified value                                                          |
| ---------------------------- | ----------------------------------------------------------------------- |
| Application source           | `fc29ba4b366cbd72e1d8f39442626de6028b18ef`                              |
| PR #127 HEAD                 | `78ad1652a222e912322de3b8c0fb190ca06ff2d4`                              |
| Corporate NSIS SHA256        | `CD5AB0B5B0E5DBDC2921DBB08173D29F8B732982E28D79418605569EBD8E8AB5`      |
| Installed EXE SHA256         | `BCF7303807570C683979217BA1BE1672B283CF8626F7213E12C02D34507A738A`      |
| Installed ASAR SHA256        | `4D2ACC35A212DDA9B65FE5C2DAC4D48E547B1A2E16D9E7EB775AC77AEFC79BB4`      |
| Package                      | DevCrew 1.4.197, Corporate, 180,676,935 bytes, NotSigned test installer |
| Guest                        | Windows 10 x64, `10.0.19045.6466`, 2 GB RAM, 2 CPUs                     |
| VirtualBox / Guest Additions | `7.2.16r174877` / `7.2.16 r174877`; headless                            |

**PASS:** the existing staged installer matched the manifest before execution;
NSIS exit code was **0**. Installed EXE/ASAR hashes matched after installation
and again before the final ordinary startup. No rebuild or installer substitution
occurred. Source is an ancestor of PR HEAD; only acceptance documentation/harness
paths differ between those revisions, with unchanged application/package inputs.

## Native outcomes

| Check                              | Status and evidence                                                                                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Actual installed Corporate profile | **PASS** — installed package metadata is `corporate`; hashes match                                                                           |
| Ordinary production startup        | **PASS** — no debug arguments, no E2E/debug override variables, process alive, renderer startup hydration completed                          |
| Renderer security                  | **PASS** — packaged app, zero visible windows, sandbox and context isolation enabled, Node integration disabled                              |
| General Settings open/close/reopen | **PASS** — two complete cycles, controls and DOM state observed                                                                              |
| Preset apps and local icons        | **PASS** — VS Code, Cursor, Zed and Custom app menu; five inline SVG glyphs; zero external image resources in all captured DOM snapshots     |
| Custom app editing                 | **PASS** — unsaved draft inspected; empty command prevented persistence; draft absent after reopening                                        |
| Idle                               | **PASS** — 30 seconds in each Settings cycle plus 30 seconds after closing; full scoped observation about 153 seconds including interactions |
| Independent Settings CDP           | **PASS** — zero HTTP(S)/WebSocket requests during completed scope, including zero Google/gstatic or remote-image requests                    |
| Runtime Settings observer          | **PASS** — nine scoped records, zero external destinations; this is corroborating evidence, not the independent zero-egress proof            |
| Controlled renderer request        | **PASS** — one loopback fetch independently detected by CDP and matched by the runtime observer                                              |
| Attribution                        | **PASS** — renderer, `electron-session-web-request`, automatic app-owned activity, `app-lifecycle`, lifecycle/scenario `idle`                |
| Diagnostic privacy                 | **PASS** — controlled query fixture absent from all 21 emitted JSON/JSONL artifacts; recorded destination contains only origin               |
| Diagnostic exit                    | **PASS** — probe exit code 0 and `gracefulClose: true`                                                                                       |

The controlled request to guest loopback **completed successfully**. The runtime
record retained decision `disabled` with reason
`automatic_app_egress_requires_explicit_enablement`. This is the observer's
policy classification, **not evidence that this loopback transfer was blocked**.
No allowlist or enforcement setting was relaxed to obtain this result.

## Corporate regression scope

**PASS — actually executed:** `telemetryGetConsentState`, `linear.status`, and
`jira.status` rejected with the disabled Corporate capability error. A Cursor
launch via `pty.spawn` rejected with `AGENT_NOT_ALLOWED_BY_ORG_POLICY`. Renderer
sandbox/context isolation remained enabled and Node integration disabled.

**NOT EXERCISED:** every individual Linear/Jira remote endpoint, all provider
launch paths, all allowlist rules, SSH-host execution, all-process/startup-wide
egress and OS background traffic. Exact installed hashes corroborate unchanged
packaged policy; they do not substitute for exercising these broader cases.

## Attempts, harness corrections and limitations

The passing diagnostic is private `attempt-5`; ordinary startup was separately
verified in private `ordinary-final`. Installation evidence remains in the
private root. Prior attempts are preserved:

- **FAIL:** first diagnostic launch timed out amid network-service restarts and
  daemon startup timeout. Ordinary startup actually hydrated, but its initial
  log reader failed on Windows file sharing. A later ordinary run independently
  passed with a shared-read log stream and bounded readiness polling.
- **FAIL:** attempt 2 assumed a keyboard shortcut would open Settings while
  the saved session restored Project Map; normal Settings-button navigation
  replaced that assumption.
- **FAIL:** attempt 3 completed the first cycle and reopened Settings, then a
  hidden-renderer screenshot timed out. Screenshot failures are now recorded
  separately while mandatory DOM/network checks continue.
- **FAIL:** attempt 4 encountered the Settings page restored from the prior
  run; the harness now returns through Back to app before starting its cycles.
- **PASS:** attempt 5 completed all scoped interaction, network, observer,
  security and graceful-exit checks. Startup and second-cycle screenshots were
  **BLOCKED** by timeout; successful first-cycle/menu/draft screenshots were
  visually inspected, and both cycles have DOM evidence.

The corrected harness also retains controlled-request evidence when fetch is
rejected, observes WebSocket creation, checks query redaction, tests provider
denial/security preferences, and propagates diagnostic failures from the outer
script. Final status was independently checked against the exit and cleanup
artifacts, not accepted from `result.json` alone. The ordinary-only mode reuses
the installed hash-verified package and clears E2E/debug override variables.

Raw screenshots, button text, account/path data and logs remain private. Only
this curated summary and sanitized records are suitable for GitHub. The required
electron skill remains unavailable; the existing hidden Playwright/CDP harness
was reused. No visible host windows or application focus calls were used.

## VM preservation

**PASS:** normal Windows shutdown was requested at `2026-10-13T10:25:20Z` using
`shutdown.exe /s /t 0` without forced application closure. Final VirtualBox state
is `poweroff`, independently verified at `2026-10-13T11:54:29Z`. Only the temporary
`DevCrew126Output` share was removed after VirtualBox released the machine;
removal exited 0 and was verified at `2026-10-13T11:54:42Z`. The original
`SecureOrcaLite` share remains read-only; private evidence and the staged installer
remain retained, with the final installer hash still matching. No agent-issued
force-poweroff was used.

All four snapshot identifiers remain retained, including pre-#126:

- `348dc6db-ee48-428d-b971-e679ad84ee4e`
- `c16a485c-3392-4689-8cf3-9915ae42ed38`
- `a71bff44-eca4-4f40-a466-0eb8c0a8ba5c`
- `0ef09032-688a-4c42-9758-7e43cee3dcf4`

## CI and disposition

**PASS:** latest HEAD `78ad1652a222e912322de3b8c0fb190ca06ff2d4` has successful
[PR Checks](https://github.com/Guan21/cc-orca/actions/runs/38365820590) and
[PR test LoC](https://github.com/Guan21/cc-orca/actions/runs/38365820298). Static
analysis, typecheck, both packaging jobs, all eight test shards and aggregate
verify passed. Conditional jobs, including CI E2E, were skipped. This is distinct
from the earlier code-equivalent run at `042f60eb`. No required checks were
reported by the CLI; branch-protection requirements were not independently proven.

**NOT EXERCISED:** submitted PR review; PR #127 has no submitted review. The local
acceptance-harness/evidence updates in this follow-up are not part of that CI
revision. Their JavaScript/PowerShell syntax, targeted lint and formatting are
checked locally, with real installed-application execution as the primary test.

Keep [#126](https://github.com/Guan21/cc-orca/issues/126) **OPEN** until review is
complete. Keep [#119](https://github.com/Guan21/cc-orca/issues/119) and Phase 2
**OPEN**. No automatic merge, system-wide zero-egress claim, or production release
approval is implied.
