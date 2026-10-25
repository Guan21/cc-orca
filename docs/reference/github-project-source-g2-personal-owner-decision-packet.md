# G2-C0 — Personal Pilot Owner decision packet (NOT AN APPROVAL)

**Status:** REVIEW PACKET / LIVE-SOURCE NO-GO  
**Issue:** #181; parent #152 / #116; Owner gate #151; preflight #171; native QA #153; release #148  
**Implementation evidence baseline:** [Draft PR #180](https://github.com/Guan21/cc-orca/pull/180) at `59c237096ba780e17ca8d43356aeae90dbbfcab7` (stacked on Draft #177; **unmerged**).

> This document records requirements and missing evidence, not a permission grant. Publishing or approving the *document* does not authorize any DevCrew GitHub request, use of OS keyring, native `gh`, IPC sender, Renderer delivery, source activation, merge or release. The private solo-maintainer exception under #151 does **not** waive technical controls or establish independent review.

## 1. Decisions that must not be conflated

| Decision | Current disposition | Meaning |
| --- | --- | --- |
| Product scope | **ACCEPTED** in #151 (2026-10-18) | Packaged native Personal; explicit user-selected same-repo PR; fixed bounded manually initiated read; no Corporate/WSL/SSH/relay/Development source |
| Offline implementation and static evaluation | **AUTHORIZED / PARTIAL OFFLINE PASS** | Inert Main contracts and tests may progress without accessing actual credentials or GitHub source |
| Controlled real credential/GraphQL test | **NOT APPROVED / BLOCKED** | Requires a **separate, explicit** decision for a named operator, account, repository/PR, exact operation and installed test artifact, only after reviewed runtime prerequisites |
| Source/IPC fact delivery and Renderer activation | **NOT APPROVED / BLOCKED** | Requires implementation, security acceptance, effective ACL and installed native proof; test authorization alone is not activation |
| Corporate/team launch and V1 release | **NOT APPROVED / NO-GO** | Separate #155 and #148 gates; no inference from Personal Pilot |

No user action selecting a PR, successful CI, registered username, static GraphQL typecheck or an issue comment is an Owner live-source authorization.

## 2. Evidence already available (bounded claims only)

| Artifact | What it proves | What it does **not** prove |
| --- | --- | --- |
| [#171 non-secret preflight](https://github.com/Guan21/cc-orca/issues/171) | Windows executable identity/signature/hash candidate and local configuration metadata | Actual logged-in GitHub principal, keyring custody, permissions, source egress |
| [#166 Task A](https://github.com/Guan21/cc-orca/pull/166) | Main-only one-use final-delivery fence in offline tests | Protected production WebContents sender |
| [#168 Task B](https://github.com/Guan21/cc-orca/pull/168) | Revocable Main-attested selected-PR HEAD **contract** | An authenticated production HEAD source |
| [#170 Task C](https://github.com/Guan21/cc-orca/pull/170) | Default-disabled composition and 13-domain lifecycle contract | Installed subscriptions with complete production before-publication ordering |
| [#173 B5d](https://github.com/Guan21/cc-orca/pull/173), [#175 B5e](https://github.com/Guan21/cc-orca/pull/175) | Partial production Main/store/picker retirement and negative regression coverage | Full Store write/migration, window/frame/document/session and policy producer coverage |
| [#177 B5f](https://github.com/Guan21/cc-orca/pull/177) | Session replacement pre-creation retirement and Principal/HEAD revocation hardening, offline | Universal native Session ordering or real Principal/HEAD producers |
| [#180 B5g](https://github.com/Guan21/cc-orca/pull/180) | Fixed credential evidence reader, validation/revocation regressions; exact-SHA PR Checks and LoC SUCCESS | OS/keyring generation provenance, authenticated account, ACL, executable/config/process/egress confinement, source activation |
| [#151 requirements](https://github.com/Guan21/cc-orca/issues/151) | Owner accepted technical *requirements* and solo-maintainer review governance exception | Completed exact-SHA Owner self-review, live-source authorization or independent signatures |

All implementation PRs above remain Draft/unmerged at the recorded evidence baseline. Skipped CI jobs are not native/installed QA PASS.

## 3. Required security evidence — all 23 controls retained

The detailed A1–A8, B1–B9, C1–C6 definitions remain authoritative in #151/#171. This is a **triage**, not 23 new approvals. `OFFLINE` means partial code/test evidence; `BLOCKED` means production prerequisite unproven.

| Control | Evidence disposition / blocking proof |
| --- | --- |
| A1 exact Window/WebContents/frame/document/Session | OFFLINE / **BLOCKED:** installed native identity and full transition ordering |
| A2 selection separate from explicit Main grant | OFFLINE / **BLOCKED:** reviewed real consent→operation wiring |
| A3 Project/workspace/host/repo/PR immutable binding | OFFLINE / **BLOCKED:** authenticated numeric + opaque Node ID registration and real approved test PR |
| A4 Main-owned revisions/incarnation | OFFLINE / **BLOCKED:** current integrated production scope and exact-SHA acceptance |
| A5 ABA/deletion/rebind/host changes | OFFLINE / **BLOCKED:** uncovered Store writes, migrations and all before-publication publishers |
| A6 pre/post-await and final-delivery fences | OFFLINE / **BLOCKED:** authenticated HEAD/read and real protected sender |
| A7 logout/navigation/revoke/expiry/restart clearing | OFFLINE / **BLOCKED:** real principal/credential event source and stale UI clearing |
| A8 pinned native execution with no credential pivot | OFFLINE / **BLOCKED:** approved binary/config/library/process/network custody |
| B1 packaged Personal only | OFFLINE / **BLOCKED:** named installed build/OS/operator |
| B2 fixed POST to github.com GraphQL | STATIC / **BLOCKED:** runtime operation and egress proof after separate approval |
| B3 one manual action; no polling/hidden reads | OFFLINE / **BLOCKED:** real single-call HEAD + projection design |
| B4 principal/type/permissions/repository visibility | **BLOCKED:** real account/keyring/generation/ACL not demonstrated |
| B5 least-privilege read-only fields | STATIC / **BLOCKED:** effective GraphQL PR/commit/Checks permissions |
| B6 one in-flight, ≤15s, ≤1MiB | OFFLINE / **BLOCKED:** installed OS termination/confinement proof |
| B7 ≤10 suites × 8 runs; incomplete never green | OFFLINE / **BLOCKED:** approved real hidden/incomplete Checks tests |
| B8 no retry/redirect/host/realm pivot | OFFLINE / **BLOCKED:** native child/network confinement/egress |
| B9 typed 401/403/404/429/offline/timeout/revoke | OFFLINE / **BLOCKED:** installed negative response and protected-view clear |
| C1 minimal bounded facts | OFFLINE / **BLOCKED:** actual authorized source→G1→display |
| C2 no body/diff/prompt/token/email/author leakage | STATIC / **BLOCKED:** runtime dataflow validation |
| C3 redacted errors/logs/telemetry | OFFLINE / **BLOCKED:** installed source stderr/telemetry inspection |
| C4 Main memory only; no persistence/export | OFFLINE / **BLOCKED:** installed disk/cache/export audit |
| C5 15min grant/5min freshness + residual revoke risk | OFFLINE / **BLOCKED:** real expiry/clearing + Owner residual-risk acceptance |
| C6 CI ≠ native Agent/Task completion | OFFLINE / **BLOCKED:** true selected-PR GitHub facts displayed without false attribution |

**Aggregate: 0 / 23 are marked production-approved here.** The row labels do not overwrite #151 control checkboxes. Nothing is promoted by documentation-only CI.

## 4. Exact Owner input / decision record (intentionally blank)

Fill **only after** inspecting the final reviewed code/ADR and approved test procedure. Do **not** paste tokens, headers, keyring dumps, auth environment values, GraphQL raw sensitive output or unrelated personal data.

| Field | Owner-supplied value / disposition |
| --- | --- |
| Owner and security self-review identity / date | **PENDING** |
| Reviewed ADR revision and exact implementation SHA | **PENDING** — #180 SHA is evidence baseline only |
| Test operator and native QA owner | **PENDING** |
| Isolated test repository, explicitly selected PR and allowed GitHub host | **PENDING** — #170/#180 are **candidates only**, not authorized targets |
| Immutable numeric repository ID and GraphQL Node ID | **PENDING** — obtain by separately approved Main registration; never derive from owner/name |
| Windows/macOS packaged Personal build identity, binary SHA, installed OS/architecture | **PENDING** |
| Actual GitHub principal identifier; credential type, permission classes, expiry/SSO and repository visibility (no secrets) | **PENDING** |
| Explicitly allowed one-use registration operation and consent | **PENDING** |
| Explicitly allowed bounded selected-PR Refresh operation/query, destination and read budget | **PENDING** |
| Native keyring/config/executable/process/library/egress custody evidence location | **PENDING** |
| Lifecycle, authorization loss, denial, timeout, stale HEAD and restart test plan/evidence location | **PENDING** |
| Residual remote token-revoke window, limits, rollback and stop conditions | **PENDING / NOT ACCEPTED** |
| **Separate Owner decision: permission to run the defined real test** | **NOT APPROVED** |
| **Separate Owner decision: source activation and deployment** | **NOT APPROVED** |
| Independent third-party security review | **NOT PERFORMED** (private Personal solo-maintainer exception recorded in #151; **not** equivalent to approved review) |

## 5. Engineering dependencies before requesting a controlled live test

1. **Principal and credential generation:** review a real OS-specific GitHub account/keyring identity producer with synchronous invalidation. #180 captures a callback; it does not establish the producer or custody.
2. **Native execution confinement:** authenticate installed `gh` binary/config ownership, environment isolation, library/process-tree bounds, no WSL/SSH/relay/fallback/hidden retry and provable egress/termination. Hash alone is insufficient.
3. **Immutable registration + HEAD:** review fixed, distinct consent for repo Node ID/numeric ID registration; pin one selected PR and HEAD. HEAD and projection must respect the approved single-manual-request budget; no hidden supplementary query.
4. **Main lifecycle completeness:** resolve all 13 domains' trusted before-publication producers, including remaining Store writers/migrations, native Window/Frame/Document/Session, expiry and policy mutation; missing inputs must keep readiness denied.
5. **Authorization-to-display path:** approved real B3/B4 grant, current Sender scope, exact SHA, synchronous final fence and immediate stale-view retirement. Never make CI Checks into an Agent task-completed claim.
6. **Effective field ACL:** verify repository metadata, PR, commit, Checks permissions and partial/incomplete handling under an explicitly authorized least-privilege credential. Static GraphQL/REST documentation is **not** effective GraphQL proof.
7. **Native acceptance:** only after approval, execute #153 Windows/macOS installed-app positive and negative cases tied to the exact build SHA; attach redacted network/process/log/UI evidence. Corporate has its own #155 gate.

If any mandatory prerequisite is unavailable, retain `MainProjectSourceIntegration.enabled:false`, default denied operation admission, missing composition/sender/Renderer wiring, #151 OPEN, #153 NOT EXERCISED and #148 NO-GO.

## 6. Review sequence / hold points

- **Hold 0 (now):** offline/static evidence, issue/PR/CI management only; **NO REAL SOURCE ACCESS**.
- **Hold 1:** Owner chooses named test environment/principal/repository/PR and records the exact allowed **future** registration/read operations, credential scope, artifacts, safeguards and residual risk. This is not a substitute for implementation proof.
- **Hold 2:** finish and self-review missing trusted Main/native provenance, effective least privilege, before-publication ordering and final delivery; record exact code SHA and independent-review exception honestly. A decision to perform controlled tests is explicit and separate.
- **Hold 3:** approved limited native credential/GraphQL proof and then #153 installed-app E2E, with immediate stop/fail-closed if identity, scope, ACL, confinement or event ordering cannot be demonstrated.
- **Hold 4:** only after all evidence is complete, separately consider Personal activation. Corporate/team/V1 are **not** covered.

**Current decision: HOLD 0 — BLOCKED for any real application GitHub request.** The Owner has not completed this decision record. No live test or production feature activation is performed by creating this document.
