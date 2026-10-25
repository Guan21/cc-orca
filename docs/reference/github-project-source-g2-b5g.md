# G2-B5g: native principal and credential custody boundary

Issue #178 / parent #152 / #116. Stacked on Draft #177 at
`23e7594f6377baacde6ec28411295b77604181c9`.

## Scope and threat model

This is a deny-only integration boundary, not authentication or custody approval.
An injected Main adapter supplies assertions; validation of their shape cannot prove
their origin. Protect Main authorization from stale identity, replacement credentials,
config/environment pivots, callback substitution, reentrancy, lost change notification,
ABA, and uncertain process/library/network confinement. Renderer strings, configured
handles, local profile identity, environment tokens, CLI diagnostic text and fixture
receipts cannot establish authority. Permission, revision and revocation gates remain
independent: login never implies repository or Checks access.

The trusted computing boundary would include an independently reviewed native
credential/identity producer, its synchronous lifecycle owner, approved executable and
config, and OS confinement. None is established by the production code today.
Compromise of Main itself is not contained by a TypeScript callback wrapper. Capturing
a method prevents accidental callback substitution; it does not authenticate that
method, its receiver's mutable state, or the credential store behind it.

Production `project-source-main-bootstrap.ts` still constructs
`MainCredentialEvidenceProvider()` without an adapter, sets integration `enabled:false`
and operation admission `isEnabled: () => false`. No source, fact sender, authenticated
HEAD producer, credential reader or Renderer activation is added. Folder, SSH, WSL and
relay contexts gain no authority; provider permissions are not broadened.

## Audited sources of truth

Paths below are relative to `src/main/`.

| Source                                                                                   | What local code establishes                                                                                                            | What it cannot establish                                                                                                                             |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `github/project-source-native-principal.ts`                                              | Allowlisted detached evidence, fixed host/source, safe generation, immutable pin and permanent retirement on observed mismatch/reentry | A real GitHub login, OS custody or completeness of generation events                                                                                 |
| `github/project-source-main-credential.ts`                                               | Subscription failure/change retires principal and dependents; listeners run before adapter cleanup                                     | That a cleanup function implies reliable native notifications                                                                                        |
| `startup/main-process-ready-foundation.ts`                                               | Orca profile ID and Store/profile object continuity                                                                                    | Authenticated GitHub principal identity                                                                                                              |
| `ipc/orca-profiles.ts`                                                                   | Before-selection hooks for selection/transfer and before-signout retirement                                                            | GitHub logout/replacement/SSO events; connect/refresh/select-org hooks run after awaited mutation, and background cloud invalidation only broadcasts |
| `startup/main-window-core-services.ts`; `startup/main-window-controller.ts`              | Retirement before relaunch work and replacement Main window construction                                                               | Universal installed Electron/OS ordering                                                                                                             |
| `github/project-source-main-catalog.ts`; `github/project-source-production-lifecycle.ts` | Covered Store before-mutation barriers and conservative lifecycle observations                                                         | Complete Store writers or all thirteen lifecycle domains; lifecycle readiness remains unavailable                                                    |
| `github/client/fetch/authenticated-viewer.ts`                                            | Generic CLI login/email result for existing UI                                                                                         | Immutable principal ID, generation, custody, synchronous invalidation or operation authorization                                                     |
| `github/auth-diagnose.ts`                                                                | Free-text CLI diagnostic parser                                                                                                        | Custody: non-environment/unknown labels can be classified as keyring; this is not an attestation                                                     |
| `git/command-runner/project-source-native-gh.ts`                                         | Fixed operation/host, pinned executable metadata/hash, controlled environment, explicit confinement callback and termination gate      | A genuine confinement provisioner or authenticated credential source                                                                                 |

No existing production-native event was found that guarantees synchronous GitHub
credential/principal invalidation. Generic `gh auth status`, polling after a change,
handle/config equality and an unobserved A-B-A cannot supply before-publication proof.
These pathways were inspected as source only; no CLI diagnostic or application API ran.

## Windows/macOS packaged Personal evidence matrix

BLOCKED means the required native evidence is absent. PARTIAL describes bounded local
code evidence only. No row confers production readiness on either operating system.

| Required provenance/custody fact                   | Windows Personal                         | macOS Personal                         | Evidence required before admission                                                              |
| -------------------------------------------------- | ---------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Local identity ownership                           | PARTIAL: Main profile/window/session pin | PARTIAL: same contract                 | Installed owner/session binding and replacement ordering                                        |
| Authenticated immutable GitHub principal           | BLOCKED                                  | BLOCKED                                | Reviewed authenticated account ID bound to approved credential, not login string                |
| Keyring custody and authorized readers             | BLOCKED                                  | BLOCKED                                | Native store ownership/access proof, no plaintext fallback, reviewed read surface               |
| Principal/credential generation                    | BLOCKED                                  | BLOCKED                                | Trusted monotonic generation and non-reusable identity across replacement/ABA                   |
| Replacement, logout, SSO expiry, access revocation | BLOCKED                                  | BLOCKED                                | Native producer retires before publication/delivery, including external mutation and event loss |
| Executable and config ownership                    | BLOCKED; pinning contract only           | BLOCKED; pinning contract only         | Approved installed binary hash/signature, config ownership/ACL, replacement resistance          |
| Environment/config pivot resistance                | BLOCKED; allowlist contract only         | BLOCKED; allowlist contract only       | No ambient token/proxy/config override, independently evidenced stable invocation context       |
| Process and library confinement                    | BLOCKED                                  | BLOCKED                                | OS-enforced child/library/credential access boundaries for installed artifact                   |
| Network confinement and termination                | BLOCKED; callback/permit contract only   | BLOCKED; callback/permit contract only | Independent OS egress/child termination evidence, no fallback or alternative channel            |
| Credential type/scope/expiry                       | BLOCKED                                  | BLOCKED                                | Non-secret approved credential metadata and expiry/SSO policy                                   |
| Effective repository and Checks visibility         | BLOCKED                                  | BLOCKED                                | Separately authorized private Repo/Checks positive and negative ACL verification                |
| Selected-PR HEAD and source admission              | BLOCKED                                  | BLOCKED                                | Authenticated registration, bounded operation approval and trusted HEAD lifecycle               |

#171's executable metadata and configured handle are non-secret preflight evidence
only. They satisfy none of the authentication/custody/ACL rows above.

## Deny-only implementation and failure gates

The provider captures and validates the adapter evidence method once before installing
its change subscription, preserves its method receiver, and rejects malformed or
throwing acquisition. Later method replacement cannot change the evidence source
behind an already installed subscription. The existing principal validator, frozen
evidence fields, generation pin, status vocabulary and retirement path are reused.
No new attestation type, token representation, producer, dependency or policy is added.

| Failure                                                       | Code disposition and proof boundary                                                                                          |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Unknown identity/keyring unavailable                          | No adapter or null/invalid/throwing evidence returns no principal; permanent retirement once a supplied verifier fails       |
| Reader callback replacement/accessor pivot                    | Captured original reader; replacement never runs; invalid acquisition retires before subscription                            |
| Credential replacement/generation mismatch                    | Changed pinned fields retire permanently; restoring old evidence does not restore consent                                    |
| Reentrant attestation/accessor/cleanup                        | Existing verification guard retires; dependent listeners precede cleanup; negative tests cover every evidence field accessor |
| Broken subscription or explicit untrusted-change notification | Malformed/throwing install or notification retires; known notified ABA is denied                                             |
| Lost notification with an observable changed read             | Pin comparison retires on mismatch                                                                                           |
| Lost notification with unobserved ABA/stale cached evidence   | Undetectable by this contract; no production adapter is installed, so production remains unavailable                         |
| Window/session/profile switch                                 | Existing local retirement and fresh provider ownership retained; universal native ordering is not claimed                    |
| Config/environment pivot or uncertain confinement             | Existing runner rejects mismatched config, disallowed environment or absent confinement; production runner remains disabled  |

Offline evidence uses explicit synthetic fixtures. Even a fixture that passes
`status().login === 'VERIFIED'` proves only that the supplied contract was accepted.
Repository/Checks status remains NOT VERIFIED and live source LIVE_SOURCE_BLOCKED.

## Separate runtime approval packet — not executed

Before future #151/#153 work, the designated Owner/security reviewer and operator must
approve a bounded procedure for each OS. Record their names/roles and explicit approval;
the implementing agent cannot substitute its own acceptance.

1. Pin exact application SHA, installed package hash/signature, OS version/architecture,
   native executable hash, Personal profile and isolated test environment.
2. Designate an approved test account, repository and PR; record only non-secret
   credential type, scope, expiry and SSO policy. Explicitly authorize each API/operation,
   keyring interaction and network destination. Never record token contents.
3. Review the native identity/custody producer and prove account ID binding, keyring
   ownership/read permissions, config ACL and absence of plaintext/environment fallback.
4. Exercise replacement, logout, expiry/SSO revocation, external credential mutation,
   generation mismatch/ABA, dropped notifications, reentrancy, session/window switch and
   config/binary pivots. Require retirement before publication and final delivery. A
   post-change poll or repeated equality comparison is insufficient.
5. Verify effective private repository and Checks ACL with approved allow/deny cases;
   separately approve authenticated registration and selected-PR HEAD operations.
6. Independently capture OS process/library/egress confinement and termination evidence,
   including negative bypass attempts within the approved scope. Uncertain confinement
   or lost lifecycle coverage must keep admission denied.
7. Attach sanitized evidence tied to exact SHA and installed artifact, distinguish each
   PASS/FAIL/BLOCKED/NOT EXERCISED, and obtain actual Owner acceptance. Review any later
   source activation separately; this packet grants no activation authority.

## Verification and residual blockers

The new regression suite first reproduced callback substitution and acquisition-order
failures. Existing tests cover authorization/revision/revocation, notified ABA, Session
retirement, environment rejection and confinement uncertainty; no native process is
executed by the mocked runner suite. Final local and exact-SHA CI counts are recorded
in the delivery PR and #178/#152, with skipped checks separately listed.

Code-level PASS does not establish OS authentication, native credential custody,
effective ACL, complete lifecycle producers or installed-app acceptance. Principal,
custody and HEAD remain BLOCKED. Preserve B5e/B5f uncovered Store and lifecycle gaps.
#151 remains OPEN, #153 NOT EXERCISED, and #148 V1 NO-GO. No merge or issue closure.
