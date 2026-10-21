# G2-B5c Task A — Main-only pinned selected-PR final-delivery fence

Issue: #165 (child of #152 / #116). Security: #151. Native E2E: #153.
Base: CI-green [Draft PR #164](https://github.com/Guan21/cc-orca/pull/164), `5154139d9725733c3f30ce1cc614053a7c39f33b`. The upstream sequence #157–#164 remains Draft/unmerged.

## Delivered

`project-source-main-pr-evidence-delivery.ts` is a **Main-only, inactive** single-use synchronous fact-delivery contract. A prospective Main-owned, authoritative HEAD source must later supply a current, revocable observation pinned to exact Project/Workspace/Worktree/host, immutable registered GitHub Repository and PR, Main document/session/principal/credential generation, Selection/Binding/Grant revisions and Session incarnation.

The contract checks all these fields, SHA syntax, five-minute HEAD evidence age, the existing bounded G1 source-scope parser and exact PR + HEAD commit + all check run SHA binding. Empty check observations may be displayed **only as unknown CI**, never as all-green. A second Main authority/observation check immediately precedes the synchronous sink. The one-shot operation permit is consumed before any potentially reentrant provider callback. Raw GitHub response/error/token data is never sent; only already normalized G1 facts may be emitted. Failures do not authorize retry of the same fence.

Focused offline tests cover valid single-use projection, disabled/no-source, malformed/expired HEAD evidence, foreign scope, changed document/principal/credential/selection/grant/incarnation, A→B→A revision changes, wrong PR/HEAD/check, reentrant authority callback, late revoke, missing check evidence and sink error.

## Critical non-claims

This contract **is not connected** to production `MainProjectSourceBootstrap` and **does not provide a real authoritative GitHub PR HEAD**. A TypeScript type, timestamp and strings alone cannot authenticate observation provenance. A future review must approve the actual Main verifier and native credential/ACL/OS confinement to supply it. Renderer state and local `git rev-parse HEAD` cannot substitute for GitHub PR HEAD. The new class does not itself issue a Grant, call a network API, provide a transport runner, open native dialogs, create IPC or send to Renderer.

Existing B5a `isEnabled: () => false` and no refresh callback remain exactly unchanged. B5b production panel still receives `{status:'disabled'}`. Do not wire a sink into a WebContents or return `ready` across IPC until a **separate review** establishes an end-to-end current BrowserWindow/MainFrame/Document/Session/principal/selection grant and exact-HEAD delivery fence. The established `MainProjectSourceIntegration.refresh()` and `MainSelectedPrGrantRegistry.run()` must be reused rather than bypassed.

Thus **B5c Task A OFFLINE CONTRACT CODE** may be achieved if CI is green, but B5c production integration and all live release gates remain **PARTIAL/BLOCKED**.

## Next tasks and acceptance

1. Identify and independently verify Main-owned GitHub PR HEAD authority, without Renderer input or assumptions about a local branch. Until available, fail closed.
2. Compose the validated HEAD with B4c's `refresh(event, headSha, deliver)`, B3 consent and registry one-time Grant, guarding origin before and after awaits. Add an explicit, bounded Main-to-Renderer delivery IPC envelope only after a full payload review and delivery-time reauthentication.
3. Wire B5b UI to Main-only factual messages with immediate scope-change clearing and no fixture fallbacks. Test current Document/Session ABA, renderer reentrancy, process teardown, stale HEAD and stale GitHub results.
4. Perform Owner exact-SHA security review #151, effective Repository/Checks ACL validation, native OS/network/process confinement and installed Windows/macOS QA #153. Corporate and development sources always blocked. V1 #148 remains NO-GO.

No real application GitHub API, native gh, token, keyring, permissions or Corporate egress changes occurred in Task A. Existing historical local Windows POSIX-path fixture failures and auxiliary bot #156 are separate. Verify final-head GitHub CI before any PASS declaration.
