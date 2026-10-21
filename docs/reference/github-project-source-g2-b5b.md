# G2-B5b — selected-PR evidence UI (offline, default disabled)

Tracking: #152 / #116. Security: #151. Installed native E2E: #153. Release gate: #148.
Stacked on B5a Draft #163 at `eff576de3c8fad0ed7f1d6d47073f6a11af63b73`. No earlier PR merged.

## Purpose and integration

This increment adds a read-only **Selected PR evidence** panel beside DevCrew Project Map, without implying Project Map's task/agent state is GitHub data. Production `ProjectMapDesktopPage` always passes `{status:'disabled'}` because B5a exposes only status-only intents and the live Credential/HEAD/final-delivery chain is unapproved. It does **not** fetch, register, refresh or synthesize GitHub information on mount.

The separate `SelectedPrSourcePanel` can render only a future B5c Main-delivered state; this is a view component and **not an authorization gate**. The future B5c producer must verify the Main session, document, exact Project/Repository/PR/HEAD, account and operation grant, complete facts and freshness before and at synchronous delivery. Passing a `ready` prop in an isolated test is not authentication. The renderer cannot convert a fixture, Zustand/Session snapshot or a normal GitHub PR view into Main authorization.

## Evidence and negative state semantics

Pure `selectedPrFactsView` delegates strict v1 scope/fact/time checks to the existing G1 `projectGitHubFacts`; it then insists on one matching selected PR, one matching HEAD commit and every observed check belonging to the selected HEAD. On missing/foreign/mismatched/stale data it hides all facts, rather than retaining prior evidence or presenting unrelated data. A missing check list explicitly reads `CI outcome unknown`, never "all green". It does not convert PR/check evidence into task progress, Agent runs or CI completeness.

Represented negative/loading statuses: disabled, not_selected, loading, denied, incomplete, stale, rate_limited, unavailable, error, offline. All render no previously observed facts. The production panel remains **disabled** regardless of ordinary Renderer active repository or Project Map demo/activity.

## Test plan and security boundaries

Focused Vitest model and happy-dom tests cover no-fixture production status, exact scope/PR/HEAD, cross-HEAD check rejection, invalid and stale facts, missing commits/checks, refusal to fabricate CI success and immediate removal of old facts when status changes.

There is no new Main or Renderer privileged bridge, no credential storage, no native `gh` call, no production data adapter, no Corporate policy change, no permission widening or persisted authority. Existing B5a owner/consent/delivery restrictions remain unchanged.

## Before B5c and G3

B5c requires a Main-authenticated/pinned expected HEAD, sole Main-owned projection delivery, **synchronous final authorization and document fence** at the last fact handoff, and lifecycle cancellation (including result completion after revoked Window/Project/PR). It must audit all new IPC payloads and keep default disabled until #151 exact-SHA Owner acceptance of real Credential/config/Checks ACL and effective native executable, libraries, env, network and process confinement. #153 must test native installed Windows/macOS actual data, negative cases and surviving-child termination.

Historical Windows POSIX-path fixture failures and auxiliary bot #156 remain separate. CI status on the final B5b SHA must be recorded, not inferred from B5a. Live GitHub Source BLOCKED; Corporate Source DISABLED; V1 NO-GO.
