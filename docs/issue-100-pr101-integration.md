# PR #101 integration preparation

> Implementation plan for the owner of PR #102. Apply only after PR #101 is integrated into `company-work`; do not merge either PR as part of this procedure.

**Goal:** Preserve the independent local Session History and local Skills exceptions while keeping broad Corporate capabilities disabled.

**Architecture:** Start from the updated base containing #101's dedicated history policy. Preserve the existing fail-closed namespace replacement and independently restore only the declared local methods in each namespace. No history backend changes belong in this preparation change.

**Tech stack:** TypeScript, Vitest, Git, GitHub CLI.

## Status and evidence

Preparation reviewed against #101 head `6b1b4bd64fef0a49bde617b1b1772ba4e9e276b1` and #102's Skills implementation. At preparation time #101 is open and unmerged. **Pending external condition: #101 must be integrated into `company-work` before synchronization and combined regression execution.** Recheck its final merged contents because its head can change.

#101 exports `CORPORATE_LOCAL_SESSION_HISTORY_METHODS` from `src/shared/corporate-session-history-policy.ts`. Its exact declared methods are `listSessions`, `resolveSessionTitles`, `cancelListSessions`, `prepareSessionResume`, `listSubagentSessions`, `getFirstUserPrompt`, `deleteSession`, and `onWindowFocused`. All eight are declared in `src/preload/api/ai-vault-api.ts`.

#102 permits Skills `discover`, `freshnessInventory`, `deleteSupported`, `previewDelete`, and `delete` through `isLocalSkillOperation` in `src/shared/corporate-skills-policy.ts`. The broad `skills` and `ai-vault` capability flags must remain disabled. Jira and Linear namespace gates introduced by #102 must remain intact.

## Safe synchronization

- [ ] Confirm #101 has merged and record its merged commit:

```sh
gh pr view 101 --repo Guan21/cc-orca --json state,mergedAt,mergeCommit,headRefOid
```

Require `state: MERGED` and a non-null merge commit. If it is still open, stop this synchronization procedure; continue independent #102 CI repairs. Do not cherry-pick #101 or copy its backend into #102 while waiting.

- [ ] In the existing isolated #102 worktree, verify the branch and clean working tree. Commit authorized #102 CI repairs before syncing; do not discard or stash another agent's changes.

```sh
git branch --show-current
git status --short
git fetch origin company-work
git log -5 --oneline origin/company-work
```

Require branch `fix/issue-100-corporate-cli-skills-cleanup` and no outstanding work. Inspect the fetched base to confirm the final history policy and preload exception are present. A squash/rebase merge may give #101 a different final commit from its reviewed head.

- [ ] Merge the updated base into this feature branch, preserving published history:

```sh
git merge --no-commit --no-ff origin/company-work
```

This synchronizes the feature branch; it does not merge either PR. Review all changes before committing. If conflicts occur, resolve only the overlapping preload files as below and inspect other conflicts individually. Never use whole-file `--ours` or `--theirs` for the shared preload files.

## Shared-file resolution

In `src/preload/corporate-preload-api-filter.ts`, keep both policy imports:

```ts
import { isLocalSkillOperation } from '../shared/corporate-skills-policy'
import { CORPORATE_LOCAL_SESSION_HISTORY_METHODS } from '../shared/corporate-session-history-policy'
```

Keep the existing Jira and Linear entries in `CORPORATE_PRELOAD_API_CAPABILITY_GATES`. Immediately after `filtered[key] = createDisabledCapabilityReplacement(filtered, capability, key, shape)`, retain both independent exceptions:

```ts
    const originalHistory = (api as Record<string, unknown>)[key]
    if (key === 'aiVault' && isBridgeNamespace(originalHistory)) {
      const localHistory = filtered[key] as Record<string, unknown>
      for (const method of CORPORATE_LOCAL_SESSION_HISTORY_METHODS) {
        if (Object.hasOwn(originalHistory, method) && typeof originalHistory[method] === 'function') {
          localHistory[method] = originalHistory[method]
        }
      }
    }
    if (key === 'skills' && isBridgeNamespace((api as Record<string, unknown>)[key])) {
      const original = (api as Record<string, Record<string, unknown>>)[key]
      const skills = filtered[key] as Record<string, unknown>
      for (const operation of Object.keys(original)) {
        if (isLocalSkillOperation(operation)) {
          skills[operation] = original[operation]
        }
      }
    }
```

In `src/preload/corporate-preload-api-filter.test.ts`, retain #101's local-history test and #102's local-Skills/integration test. Keep #102's successful `skills.discover()` expectations in the general shape tests; #101's pre-Skills baseline expectations reject discovery and must not replace them. Keep nested remote Skills calls rejected. Preserve default-profile tests.

## Combined regression to add after synchronization

Add this complete standalone file as `src/preload/corporate-local-capabilities-integration.test.ts`. It uses real declared local method names and real Skills/Jira/Linear/plugin operation names. `syncToCloud`, `futureRemoteOperation`, and nested `cloud`/`packages` entries intentionally model future undeclared bridge additions; they are not advertised current API methods.

```ts
import { describe, expect, it, vi } from 'vitest'
import { isCapabilityEnabledForBuildProfile } from '../shared/corporate-build-profile'
import { CORPORATE_LOCAL_SESSION_HISTORY_METHODS } from '../shared/corporate-session-history-policy'
import { filterPreloadApiForBuildProfile } from './corporate-preload-api-filter'

describe('combined Corporate local capability exceptions', () => {
  it('preserves local history and Skills together while remote bridges stay disabled', async () => {
    const remote = vi.fn().mockResolvedValue(undefined)
    const unsubscribe = vi.fn()
    const localHistory = {
      listSessions: vi.fn().mockResolvedValue({ sessions: [], issues: [] }),
      resolveSessionTitles: vi.fn().mockResolvedValue(undefined),
      cancelListSessions: vi.fn().mockResolvedValue(undefined),
      prepareSessionResume: vi.fn().mockResolvedValue(undefined),
      listSubagentSessions: vi.fn().mockResolvedValue(undefined),
      getFirstUserPrompt: vi.fn().mockResolvedValue(undefined),
      deleteSession: vi.fn().mockResolvedValue(undefined),
      onWindowFocused: vi.fn(() => unsubscribe)
    }
    const localSkills = {
      discover: vi.fn().mockResolvedValue([]),
      freshnessInventory: vi.fn().mockResolvedValue({}),
      deleteSupported: vi.fn().mockResolvedValue(true),
      previewDelete: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined)
    }
    const api = {
      aiVault: {
        ...localHistory,
        syncToCloud: remote,
        futureRemoteOperation: remote,
        cloud: { upload: remote }
      },
      skills: {
        ...localSkills,
        getPackage: remote,
        installShare: remote,
        listOwnedShares: remote,
        getUpdateRun: remote,
        futureRemoteOperation: remote,
        packages: { install: remote }
      },
      jira: { connect: remote, status: remote },
      linear: { connect: remote, status: remote },
      plugins: { install: remote, refreshMarketplaces: remote }
    }
    const filtered = filterPreloadApiForBuildProfile(api, 'corporate')

    for (const capability of ['ai-vault', 'skills', 'jira', 'linear', 'plugins'] as const) {
      expect(isCapabilityEnabledForBuildProfile(capability, 'corporate')).toBe(false)
    }
    expect([...CORPORATE_LOCAL_SESSION_HISTORY_METHODS].sort()).toEqual(
      Object.keys(localHistory).sort()
    )
    for (const method of Object.keys(localHistory) as (keyof typeof localHistory)[]) {
      expect(filtered.aiVault[method]).toBe(localHistory[method])
      if (method === 'onWindowFocused') {
        expect(filtered.aiVault.onWindowFocused()).toBe(unsubscribe)
      } else {
        await filtered.aiVault[method]()
      }
      expect(localHistory[method]).toHaveBeenCalledOnce()
    }
    for (const operation of Object.keys(localSkills) as (keyof typeof localSkills)[]) {
      expect(filtered.skills[operation]).toBe(localSkills[operation])
      await filtered.skills[operation]()
      expect(localSkills[operation]).toHaveBeenCalledOnce()
    }
    const disabledActions = [
      ['ai-vault', filtered.aiVault.syncToCloud],
      ['ai-vault', filtered.aiVault.futureRemoteOperation],
      ['ai-vault', filtered.aiVault.cloud.upload],
      ['skills', filtered.skills.getPackage],
      ['skills', filtered.skills.installShare],
      ['skills', filtered.skills.listOwnedShares],
      ['skills', filtered.skills.getUpdateRun],
      ['skills', filtered.skills.futureRemoteOperation],
      ['skills', filtered.skills.packages.install],
      ['jira', filtered.jira.connect],
      ['jira', filtered.jira.status],
      ['linear', filtered.linear.connect],
      ['linear', filtered.linear.status],
      ['plugins', filtered.plugins.install],
      ['plugins', filtered.plugins.refreshMarketplaces]
    ] as const
    for (const [capability, action] of disabledActions) {
      await expect(action()).rejects.toThrow(`Capability disabled in corporate build: ${capability}`)
    }
    expect(remote).not.toHaveBeenCalled()
  })

  it('preserves both namespaces and remote bridges unchanged in default builds', () => {
    const api = {
      aiVault: { listSessions: vi.fn(), syncToCloud: vi.fn() },
      skills: { discover: vi.fn(), installShare: vi.fn() },
      jira: { connect: vi.fn() },
      linear: { connect: vi.fn() }
    }
    expect(filterPreloadApiForBuildProfile(api, 'default')).toBe(api)
  })
})
```

## Validation and delivery

- [ ] Run with `ORCA_BACKGROUND_LAUNCH=1` in the environment; these checks require no visible Electron windows:

```sh
pnpm test src/preload/corporate-preload-api-filter.test.ts src/preload/corporate-local-capabilities-integration.test.ts src/shared/corporate-skills-policy.test.ts src/shared/corporate-session-history-policy.test.ts
pnpm tc
pnpm run check:code-quality:changed
git diff --check
```

Run `pnpm run test:corporate-egress` only on an isolated display/VM or CI. Its lifecycle scenarios invoke native focus/show operations and must not run on the user's desktop, even with `ORCA_BACKGROUND_LAUNCH=1`.

Inspect each result and fix failures before committing. Review the final diff against `origin/company-work`: history implementation should be inherited from the base, not appear as additional #102 history changes. Use the Lore commit format for the synchronization commit and push without force. Re-run required PR CI after pushing.

- [ ] Keep #102 Draft and #100 open until CI and packaged M2 acceptance requirements are satisfied. This document does not authorize merging, removing Draft, closing issues, or treating unavailable packaged tests as passed.

**Execution status:** Combined regression code is prepared but has not been executed against a combined implementation. No synthetic combined implementation was created. Execution remains pending #101's base integration; existing separate-branch test results do not prove the combined behavior.
