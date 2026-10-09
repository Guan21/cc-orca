# Issue 100 integration audit and cleanup plan

## Plan

1. Add failing Corporate tests at the existing Jira and Linear credential/client boundaries.
2. Apply the existing Corporate network contract before credentials, SDK construction, proxy resolution, and HTTP.
3. Return disconnected metadata during Corporate settings/startup reads, preserving stored credentials and paths.
4. Run client regressions and targeted static/type checks. UI and common capability changes belong to the other lanes.

## Audit classification

| Finding                                                                                                      | Class | Decision                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------ | ----- | -------------------------------------------------------------------------------------------------------------------------------- |
| Jira and Linear settings, token creation links and issue actions                                             | D     | Disabled in Corporate until administrator authorization is supported. A user click or saved credential is insufficient approval. |
| Linear SDK GraphQL API (`api.linear.app`) and attachment URLs                                                | D     | Block before SDK loading/construction and credential access.                                                                     |
| Jira user-entered site origin, REST v2/v3 and attachment endpoints                                           | D     | Block before token access, proxy resolution or HTTP, including self-hosted sites without administrator policy.                   |
| `.orca/linear-token.enc`, `linear-tokens`, `linear-workspaces.json`, legacy viewer and Jira token/site files | B     | Preserve location, schema and encrypted content; no implicit migration or deletion.                                              |
| Linear/Jira IPC and runtime RPC method names, issue/workspace identifiers                                    | B     | Preserve wire/API compatibility. Enforce on the execution backend, so IPC, RPC and CLI consumers share the boundary.             |
| Internal `orca` directory helpers and runtime module names                                                   | C     | Preserve internal names.                                                                                                         |
| Existing Jira API User-Agent `DevCrew`                                                                       | A     | Already branded correctly.                                                                                                       |

## Authentication and triggers

Linear uses a manually supplied API key and lazy `@linear/sdk` clients; connect validates viewer/organization. Saved credentials use the existing secret-store encryption and legacy plaintext fallback; actual operations formerly decrypted them without a Corporate guard. Jira uses API token plus email for Cloud Basic auth, username/password for Server Basic auth, or Server Bearer PAT. Connect validates `/myself`; stored site operations decrypt credentials and use the main HTTP port. Attachment requests enforce same-origin authorization. Neither backend implements OAuth or launches a browser; token-creation browser links are renderer actions covered by the UI lane.

Settings reads previously exposed saved connection metadata; Linear startup warms plaintext metadata. Corporate now exposes an empty disconnected view without SDK, credentials or metadata initialization. Existing credential files remain usable by the default build. Disconnect remains a local explicit cleanup operation.

## Network contract

Reuse `decideCorporateNetworkIntent` with `administrator-configured-egress` and no configured destination. It deterministically returns `endpoint_not_configured`; no endpoint is inferred from a stored Jira site or SDK default. No new allowlist, configuration authorization surface, dependency, or Issue 99 Session History change is introduced.

M2 packaged validation remains unavailable on this Windows host. Acceptance must verify zero integration traffic on startup/open-settings, disabled connect/test/token links, unchanged encrypted credentials, and continued default-build connectivity.
