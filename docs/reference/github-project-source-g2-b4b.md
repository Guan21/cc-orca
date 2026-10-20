# G2-B4b — bounded native GitHub transport

Implementation plan and security record, 2026-10-20. Tracking #152, gate #151,
source contract #116. V1 **NO-GO**; Corporate GitHub Source **DISABLED**.

## Baseline and scope

The GitHub stack was read before implementation: #157 (offline projection) →
#158 (Main grants) → #159 (Electron origin/consent) → #160 (registration).
The branch starts at #160 HEAD `fea25dcbf5db52e804a46d85678e112f8cbe58b5`.
Earlier branches are not modified. #150 ADR was read at
`a0493ffbfe85403a0a532896a0ae3bd5c1565ca0`, including its limited governance
supersession. #151's Owner Solo Maintainer exception permits offline development;
it supplies neither independent signatures nor a live credential/network grant.
All 23 controls remain requirements.

## Design and reuse decisions

Use the command-runner ownership boundary and its existing capture-to-termination
primitive. Do not use `ghExecFileAsync`: it inherits environment and supports
WSL/host fallback and retries. Existing GitHub Client enrichment, authenticated
viewer and auth diagnostics also use that broader runner. `auth status` is not
proof of repository or Checks access. Reuse #157's projection for fact semantics;
add only transport-specific identity/completeness validation. Reuse #158/#159
for future document/grant authority rather than adding production IPC.

Two fixed read operations have distinct Main authorization: repository registration
and selected-PR refresh. No supplementary viewer, discovery or permission query.
Main must prove packaged Personal/native profile, current Project/catalog/workspace,
principal and credential generation, exact document/session/window, binding/grant
revisions and process incarnation. No constructor grants this authority.

Pinned executable bytes and filesystem identity, controlled environment, endpoint
confinement and credential provenance are all required. A stock `gh api` hostname
flag alone cannot prove no redirects, internal retries or account substitution.
The execution confinement and credential attestations have **no production
provider in this increment**. Missing proof denies, even if `enabled` is true.
No token store, token persistence, raw response/error logging or source cache.

## Execution plan

- [x] Add failing fake-process tests, then restricted command runner: immutable
      native binary/environment, one in-flight operation, absolute ≤15s deadline,
      AbortSignal, ≤1MiB response, no fallback/retry and sanitized failures.
- [x] Add failing fixed-operation tests, then fixed queries, strict variables,
      immutable repo identity and HEAD/suite/run linkage validation; delegate fact
      projection to #157. Deny partial errors, null, incomplete/overflow/empty Checks.
- [x] Add failing Main composition tests, then principal retirement and distinct
      operation authorization with pre/post-await fences and default zero execution.
- [ ] Run focused/regression Vitest, typecheck, lint/static scans, formatting,
      Corporate endpoint scanner and independent code review; fix introduced defects.
- [ ] Commit only B4b, open a stacked Draft PR on #160's branch, record exact
      SHA/check results and append #152 progress without closing any tracking issue.

## Evidence boundaries

Public field documentation can support static query review; it cannot establish
authenticated runtime schema, actual repository visibility, complete Checks access
or least-privilege credentials. All are **NOT VERIFIED** until separately authorized
real-source validation. Tests use mocks/fake processes only. Development tooling
uses GitHub to inspect and deliver this PR; that is separate from application
transport/credential execution, which is not authorized here.

B4c must implement and review actual confinement, credential provenance/change
observation and Main composition with #158/#159. B5 supplies guarded IPC/preload
and selected-PR observed-facts UI with synchronous final delivery fence. G3/#153
requires authorized real repository/PR/Checks and installed Windows/macOS QA.
CI packaging is never installed-app E2E evidence. #151/#152/#116/#153 remain open.

## Implemented boundaries and live prerequisites

| Control                       | Offline implementation                                                                                                                                    | Remaining live prerequisite                                                                                     |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Native packaged Personal only | Runtime checks before execution and every asynchronous boundary; reject Corporate/dev/WSL/SSH/remote                                                      | Authentic Main runtime provider                                                                                 |
| Native process identity       | Absolute canonical path, file identity, SHA-256 and native image checks; controlled environment; fixed cwd                                                | Confinement must prevent executable/library/config replacement between validation and execution                 |
| Host, method, operation       | Two fixed read queries, `github.com`, JSON variables over stdin, no fallback/retry loop                                                                   | Confinement must enforce POST to the approved GraphQL endpoint, no redirects or client-internal retries         |
| Credentials                   | Main-only pinned principal/host/keyring provenance/generation/config identity; change/logout permanently retires monitor and invokes authority retirement | Reviewed credential provider and event observer; no token reader/store added                                    |
| Authorization                 | Separate registration/read action types, Main action nonces consumed once, current document/catalog/revisions callback; pre/post-await checks             | #158/#159 bridge must issue authentic leases from native consent and retire B4a plus all grants on change       |
| Resource bounds               | 15s total deadline, AbortSignal, 1MiB response; one shared in-flight lane; max256 consumed actions per transport incarnation                              | Authorized process termination/OS confinement validation                                                        |
| Termination uncertainty       | Settled process Promise alone cannot release lane; require `onChildTerminated`; otherwise latch unavailable/busy                                          | B4c must retain singleton/shared transport lifetime; do not bypass a latched lane by direct runner construction |
| Facts                         | Reuse #157 projection; immutable repository IDs; exact PR/HEAD/suite/run linkage; counts/pagination/empty checks denied                                   | Actual repository/Checks ACL completeness cannot be inferred from response shape                                |
| Privacy                       | No raw errors/stdio/payload logging or persistence; only allowlisted identities/facts leave composition                                                   | Review future delivery/UI/logging at its actual SHA                                                             |

The principal monitor's `loginVerified` describes only externally supplied login
evidence. It never asserts repository-read or Checks-field permission. An injected
Main proof callback is an integration contract, not proof that a real provider
exists or that credentials are least privilege. Live activation remains **BLOCKED**.

Public static schema references reviewed for the fixed query fields:
[Checks](https://docs.github.com/en/graphql/reference/checks),
[Commits](https://docs.github.com/en/graphql/reference/commits),
[Repositories](https://docs.github.com/en/graphql/reference/repos),
[Pull requests](https://docs.github.com/en/graphql/reference/pulls), and
[`gh api`](https://cli.github.com/manual/gh_api).
This is not authenticated introspection or an actual permission test:
full deployed Schema, repository and Checks permissions remain **NOT VERIFIED**.

Independent AI code review identified a process-settlement/termination distinction;
the implementation now requires explicit termination evidence before releasing
concurrency. AI review is not an independent human security approval, Owner
exact-SHA risk acceptance, native QA, or V1 release approval.

## Local verification before first Draft publication

- PASS: 89 new offline Vitest cases across four files on Node 24.19.0.
- PASS: node TypeScript project, file-scoped base/type-aware lint and formatting.
- PASS: Corporate endpoint scanner, 12,362 files, zero known/new violations.
- Initial broader run: 277 PASS, 1 SKIPPED, 1 FAIL from the unchanged tree-wide
  gh chokepoint test exceeding its 30s timeout on this Windows filesystem (460s).
  Retest uses a local command timeout only; no test, policy or allowlist is relaxed.
- CLI/web typechecks, final broad regression, changed-code gate and chokepoint
  retest are pending at initial publication; final results belong in the PR's
  exact-HEAD validation record. GitHub Actions statuses must be read separately.
- Offline AI security review: PASS after termination-evidence correction.
  Live activation BLOCKED; authenticated Schema/ACL/credentials and installed-app
  Windows/macOS E2E NOT VERIFIED / NOT EXERCISED.

Local dependency installation encountered Windows file-in-use errors. Tests use
the existing pinned dependency toolchain through a local ignored junction, with
Vitest cache disabled. No package manifest, lockfile or dependency version changed.
