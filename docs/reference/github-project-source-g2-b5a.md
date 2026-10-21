# G2-B5a — guarded IPC/preload intent boundary (offline Draft)

Tracking #152, security gate #151, source #116, release #148, E2E #153.
Stacked base: Draft #162 at `3aec94fb7a01aef470338982b4a474a615647166`.
The previous #157 → #158 → #159 → #160 → #161 → #162 chain remains unmerged.

## Increment

This is **B5a only**, not a B5 UI delivery or a real GitHub source activation.

- Two zero-argument intent channels, `devCrew:registerSelectedProjectSource` and
  `devCrew:refreshSelectedProjectSource`, are exposed by a typed preload namespace.
  Renderer cannot supply Project, Repository, PR, HEAD, access token, GraphQL query,
  principal, grant or revision.
- Main owns a single stable responder per channel. Only the approved current
  BrowserWindow/WebContents/main frame/document/session/profile may call the
  associated window owner. Missing owners always deny. Navigation invalidates
  an in-flight result, window shutdown retires ownership, and overlapping
  operations are refused. Errors and unexpected callback results are normalized
  to a fixed status allowlist.
- Production Bootstrap installs its per-window owner only alongside the trusted
  Main Selection Producer. It passes `isEnabled: () => false`, a Main-internal
  registration callback (not executed when disabled), and **no refresh callback**.
  This is deliberate: real credential, confinement, Main-pinned HEAD and final
  renderer fact delivery have no approved production providers.
- Preload Corporate builds return `disabled` without issuing IPC; the Main
  profile/document check independently rejects Corporate or development windows.
- No GraphQL facts or error payloads cross this increment's IPC. The status-only
  refresh hook is **not** a claim that Project Intelligence data can be displayed.

## Security considerations

These handlers express UI intent only. Renderer IPC invocation is not proof
of a physical click, a native consent, a Main-owned Project selection or an
authenticated GitHub principal. B4c Coordinator remains the sole registration
and read authority, and B3's separate default-Cancel native approvals remain
mandatory. No new credential provider, native gh invocation, persistence,
Corporate network policy, auto-retry, token store or production source flag.

The authorized B5b/B5c design must supply a Main-pinned expected HEAD, bind the
approved selected PR and exact current document to a single-use read, carry
only the allowlisted G1 projection and enforce a **synchronous final delivery
fence**, even after `await` and a pending IPC Promise. Simply returning
an asynchronously resolved fact object from these handlers would create a
cross-document delivery race. Do not widen the result type until that path is
reviewed and tested.

## Verification / remaining blockers

B5a offline tests cover unknown/forged senders, unexpected arguments, invalid
document attestation, disabled zero execution, pending-operation exclusion,
navigation/quit revocation, late callbacks, allowlisted outputs and Corporate
preload no-IPC behavior. These are mocked tests, not installed-app E2E.

- PR Checks and exact-HEAD test results: to be filled from live GitHub Actions.
- Real GitHub API / OS keyring / native gh in the application: **NOT EXERCISED**.
- Credential origin, effective Repository/Checks permissions and OS executable,
  library, config, network and process confinement: **NOT VERIFIED**.
- B5b UI, B5c final synchronous renderer delivery, #151 exact-SHA Owner live-source
  acceptance and #153 native Windows/macOS QA: **PENDING**.
- Corporate GitHub Source: **DISABLED**. V1: **NO-GO**.
- This is a Draft, no automatic merge or Issue closure.
