# PR #102 CI follow-up

Failed run: `37857067393`, revision `7e384fdb01a9351b1aa9591d03e6353104f53fbe`.

Plan before edits:

1. Reproduce the complete localization coverage failure; replace the hardcoded host label with the existing translated runtime label. Validate catalog, runtime catalog, extraction and coverage without adding exclusions.
2. Trace cross-version baseline resolution through checkout, origin tag availability and configured release refs. Supply genuine, provenance-checked historical release objects in CI; retain all compatibility tests.
3. Diagnose both failed unit-shard assertions and correct stale assumptions or real behavior at their source. Preserve default-build and platform compatibility.
4. Run affected checks, push Lore commits and follow the new PR checks until required jobs pass or a concrete external blocker is demonstrated.
5. PR #101 is currently open. Prepare the combined preload regression and conflict resolution without importing its history implementation prematurely. After it integrates into company-work, synchronize #102 and verify both explicit local allowlists while the broad capabilities remain disabled.

Neither PR is merged by this task. #102 remains Draft pending CI and packaged M2 acceptance; Issue #100 stays open.

## Diagnosed causes and local validation

- The complete coverage check reproduced the hardcoded host label failure. The label now uses the existing `auto.components.settings.AccountsPane.9baf45d071` translation, already present in English/Japanese and other catalogs. No coverage exclusion or new translation key was added.
- The fork's origin lacks the upstream historical tags. Full-depth checkout cannot fetch refs that origin does not publish. CI now prepares only three exact upstream refs, verifies annotated objects and peeled commits, and explicitly uses the published `v1.4.197` baseline matching this fork's package version. No compatibility test or assertion was removed, and application network policy is unchanged. See [wire evidence](issue-100-wire-ci.md).
- Unit shard 2 had two stale expectations: old CLI registration wording and a pre-Corporate source expression for terminal runtime selection. Both failed locally before correction; the affected four-file regression set passed 28 tests, and the combined CI-fix set passed 32 tests. No product workaround or timeout relaxation was introduced.
- All four full localization checks passed: coverage, catalog, runtime English catalog, extraction. Changed native/type-aware lint and React Doctor passed with zero new findings. Bootstrap provenance tests passed seven cases and real tag verification succeeded.
- The full wire suite was attempted on Windows, where extracted-release dynamic imports timed out after tag resolution succeeded. This is not a wire-suite pass; the new Ubuntu CI run must establish the complete result.

The separate `track-community-pr` workflow failed because this fork lacks `BUFO_BOT_PRIVATE_KEY` for the upstream StablyAI project bot. It is not part of the PR Checks aggregate, and GitHub reports no branch-protection-required checks on this branch. This repair still requires the complete PR Checks aggregate to pass rather than relying on that lack of protection. No upstream bot secret or external project operation was configured.

## #101 integration

At preparation time #101 remains open and unmerged. No history implementation was copied into #102. [The integration preparation](issue-100-pr101-integration.md) includes the exact safe synchronization procedure, conflict resolution retaining both namespaces, and a complete combined regression to add and execute after the base contains #101. The combined regression is not yet an executed test result.
