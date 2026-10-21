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

- Final exact-HEAD PR Checks and test LoC links are recorded on Draft #163 and
  tracking #152 after delivery; earlier failed runs remain available.
- Real GitHub API / OS keyring / native gh in the application: **NOT EXERCISED**.
- Credential origin, effective Repository/Checks permissions and OS executable,
  library, config, network and process confinement: **NOT VERIFIED**.
- B5b UI, B5c final synchronous renderer delivery, #151 exact-SHA Owner live-source
  acceptance and #153 native Windows/macOS QA: **PENDING**.
- Corporate GitHub Source: **DISABLED**. V1: **NO-GO**.
- This is a Draft, no automatic merge or Issue closure.

## CI repair and security regression record

The original `e60796e08968c7572727757a2d891f309ffddf2b` failure had two causes:
Electron's event-specific overloads rejected union event names in listener loops;
the producer integration fixture omitted `ipcMain.handle`, so real Bootstrap
registration threw and its fail-closed catch returned `false`.

The first repair was `44e153ad39eb024af7b5f66eedfcd00da195e154`. This follow-up
uses explicit Electron event registration/removal instead of the broader
EventEmitter interface. Every destruction/navigation/renderer-loss listener is
retained, with no type suppression or lint exception. The Electron mock now
rejects duplicate handlers, retains callbacks and exercises the real Bootstrap.
Disabled intents assert zero Coordinator, credential, API transport and native
gh runner calls; a runner spy throws if accidentally reached.

Additional review found callback reentrancy and revocation gaps: the initial
document provider ran before the operation permit, and final provider callbacks
could invalidate ownership after an earlier generation check. Six red regression
cases reproduced these defects. The permit now precedes every provider callback;
callback-independent owner/generation checks follow verification/readiness and
the final completion checks. Results remain status-only. This is not B5c fact
delivery or authorization to add such payloads.

Startup now installs permanent deny-if-unowned operation responders before
profile-gated window attachment. This avoids missing-handler errors for windows
that cannot acquire an owner, without granting them access. Its startup-order
regression failed before the wiring change and passed afterwards.

Offline regressions additionally exercise cross-window operation isolation,
same-WebContents owner replacement, late old-owner results, listener cleanup,
real document/session/profile loss and unchanged handler identity across windows.
Independent AI review is not Owner security acceptance or independent human QA.

Known Windows diagnostic failures remain separately recorded in
`github-project-source-g2-b4c-task-b.md`: three positive-prune cases in
`local-worktree-metadata-scan-expectation.test.ts` use POSIX `/workspace/...`
fixtures rejected by Windows absolute-path checks. No fixture, assertion or
absolute-path guard was changed for this repair.

Local follow-up verification (Node 24.21.0, Windows):

- **PASS:** six focused IPC/producer/bootstrap/retirement/preload files, 93 tests.
- **PASS:** 31 Project Source/Authorization/startup files, 527 tests (including
  focused cases; these counts are not additive).
- **PASS:** Node/CLI/Web typechecks, base lint, native-plugin and type-aware
  lint, changed-file formatting, Corporate forbidden endpoint scan (0 new
  forbidden violations), reliability manifest.
- **FAIL, retained:** the separate unchanged Windows POSIX-path diagnostic,
  14 passed / 3 failed at lines 69, 82 and 93. This is not a B5a CI regression
  and is not relabeled PASS.
- **PASS:** scoped independent AI security review; no important unresolved
  issues in the offline repair. Human Owner/live-source acceptance remains open.

B5b can proceed only as a separately scoped offline/default-disabled increment.
Main-authenticated expected HEAD, scoped selected-PR UI and B5c synchronous final
fact delivery still require implementation and review. A green B5a CI run grants
no live credential, network, confinement, native QA or release authority.
