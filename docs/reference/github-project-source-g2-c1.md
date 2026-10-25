# G2-C1 Main registration and selected PR integration

Issue #183 / parent #152. Stacked on Draft #180, pinned base
`59c237096ba780e17ca8d43356aeae90dbbfcab7`. Parallel QA and documentation branches
are not runtime dependencies or authorization.

## Intended operation boundary

Registration and Refresh are distinct user actions with separate default-Cancel
native confirmations. Registration uses the existing B4 Main catalog/registration
validator and fixed registration query. Immutable numeric repository ID and opaque
GraphQL node ID are adopted only after response and current-state validation.
Registration never grants a selected PR read.

Refresh consumes the existing B3 one-use grant. Its single fixed SelectedPrRead
query returns PR, HEAD, last commit and bounded Checks together. HEAD is derived
from that response after G1 and strict B4 linkage/completeness validation. The
B5c provider receives that HEAD and issues its private one-use receipt; composition
reads the cached projection with zero additional I/O. The final G1 fence rechecks
scope and HEAD immediately before the synchronous Main sink.

The injected fixed executor is Main-internal and absent in bootstrap. It returns
a bounded JSON string; it cannot choose query text, variables or operation budget.
The existing transport owns one-use nonce, identity/revision checks, a 15 second
deadline, 1 MiB response limit, abort and serialization. There is no retry, polling,
write operation or supplementary HEAD request. A source ignoring cancellation
cannot free the in-flight slot before it settles.

## Evidence matrix

| Component | Offline connection | Production status |
| --- | --- | --- |
| Main Store catalog and host-qualified selection | Existing B4a catalog and currentBinding reused | PARTIAL: before-publication coverage remains bounded |
| Electron Window/frame/document/Session authority | Existing B3 attest/selectTrusted/requestConsent/run | PARTIAL: installed/native ordering unexercised |
| Repository registration | Separate native consent, fixed query, immutable ID validation | BLOCKED by feature-off and missing acceptance/providers |
| Selected PR read | One fixed response for PR/HEAD/Checks | BLOCKED by feature-off and missing trusted source |
| HEAD and final facts | B5c provider receipt, composition and G1 delivery fence | BLOCKED: no authenticated producer or Renderer sink |
| Operation IPC | Status-only registration/Refresh ownership | Disabled; no privileged fact delivery |
| Credential/principal | Existing adapter-less production provider | BLOCKED; no keyring access |
| Corporate / SSH / WSL / relay / folder source | No authority or activation added | Disabled / unsupported by this native Personal boundary |

Hypothetical accepted offline path: one registration request plus one request per
separately confirmed Refresh. Disabled/missing-readiness paths: zero requests.
Fixture readiness assertions and subscription functions prove contract behavior
only; they do not authenticate any of the production lifecycle producers.

Concrete connection: `project-source-main-integration.ts` owns registration and
`refreshSelected`; `project-source-main-admission.ts` captures all required lifecycle
subscriptions and readiness producers. `project-source-main-selected-refresh.ts`
passes the real B3 run context to the B5c provider/composition and caches the same
transport projection. `project-source-native-transport.ts` retains nonce/revision
checks; `project-source-native-operations.ts` validates the complete response.
`project-source-main-composition.ts` canonicalizes the B4 repository binding before
comparison, removing sensitivity to object property order.

The exact production gap is in `project-source-main-bootstrap.ts`: it still builds
`MainCredentialEvidenceProvider()` without an adapter and integration with
`enabled:false`, supplies neither `executeRaw` nor `composition`, and registers the
operation owner with `isEnabled: () => false`. The new Refresh callback calls
`integration.refreshSelected(event)` without a fact sink, so it independently denies
even if the outer IPC gate were changed. No reviewed scoped WebContents sender or
stale-fact clearer is implemented. The existing `project-source-production-lifecycle.ts`
bridge still exposes an empty lifecycle map, not thirteen authenticated producers.

## Exact remaining live-source blockers

1. Separate Owner/security acceptance at the exact activation SHA under #151's
   existing 23 controls; no permission expansion or implementing-agent approval.
2. Resolve the public `cc-orca` repository governance discrepancy and have Owner
   confirm the isolated private Pilot repository/PR and authorized operation scope.
3. Reviewed immutable authenticated GitHub principal and monotonic principal/
   credential generations, including replacement/logout/expiry/SSO/ABA handling.
4. Proven OS keyring custody/read ownership, approved executable/config ownership,
   environment pivot resistance and absence of plaintext/ambient-token fallback.
5. Independently verified native process, library and network confinement, including
   child termination evidence and no alternative execution/egress path.
6. Actual effective repository and Checks ACL/completeness, including private Repo
   and hidden/inaccessible Checks negative cases; schema/fixture success is insufficient.
7. Trusted before-publication producers for all thirteen lifecycle domains:
   Project, worktree/host setup/execution host, repository, selected PR, Window,
   frame, document, Session, principal, credential, grant, policy and HEAD. Preserve
   B5e/B5f Store/mutation and unobserved lost-event/ABA limitations.
8. Authenticated selected PR HEAD lifecycle and same-operation response provenance;
   the offline executor supplies no production authentication.
9. Reviewed scoped revocable synchronous Main-to-Renderer sender and corresponding
   stale-fact clearer; the status-only operation reply carries no facts.
10. Separately authorized installed Windows/macOS native QA under #153, tied to
    exact application/package SHA and approved live-source procedure.

No application API/GraphQL, native gh, credential/keyring inspection, Corporate
activation or Renderer facts are exercised. Offline tests and CI are not production
security approval. #151 OPEN; #153 NOT EXERCISED; #148 V1 NO-GO. No merge or closure.

Local verification: Node 24.22.1, ORCA_BACKGROUND_LAUNCH=1, 40 Vitest files / 955 tests
passed with zero skips. All three TypeScript 7.0.2 projects passed sequentially;
changed-file lint/format, final changed-quality (base/type-aware/React Doctor), all
three ratchets and diff checks passed. Corporate Scanner: 12,392 files, zero known
baseline and zero new violations. Independent static review found no actionable
defect. Initial unbounded typecheck was stopped for resource contention; subsequent
bounded runs found two type-only issues, which were corrected before the final PASS.
Final-SHA workflow results and skipped jobs are recorded in the delivery Draft PR.
