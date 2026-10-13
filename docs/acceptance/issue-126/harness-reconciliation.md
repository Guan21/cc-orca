# Final native harness reconciliation

This reconciles [the final native PASS](https://github.com/Guan21/cc-orca/issues/126#issuecomment-6145003669)
with [the PR provenance review](https://github.com/Guan21/cc-orca/pull/127#issuecomment-6145312333).
Application source and package inputs remain at `fc29ba4b366cbd72e1d8f39442626de6028b18ef`.
No VM restart, build, install or native rerun was performed for this reconciliation.

## Executed versions and retained evidence

[harness-provenance.json](./harness-provenance.json) records SHA256 values for the
retained staged scripts, their tracked LF-normalized counterparts, and the reused
Playwright Core 1.59.1 dependency. Staged script timestamps precede the final
evidence, and their contents match the report's corrections. These hashes were
collected **retrospectively**: neither attempt saved an immutable script manifest
at launch. They identify the retained copies attributed to those executions;
they do not independently prove that bytes were never changed after execution.
The dependency tree digest is also retrospective, with its algorithm recorded.
The staged manifest's parsed fields match the tracked build manifest.

| Private execution | Retained script chain                                         | Evidence checked locally                                                                                                                   |
| ----------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `attempt-5`       | `retry.cmd` → `guest-retry.ps1` → `guest-settings-egress.cjs` | PASS result, probe exit 0, graceful close true, complete Settings CDP capture, controlled CDP/renderer attribution and four policy denials |
| `ordinary-final`  | `ordinary.cmd` → `guest-install-retest.ps1 -OrdinaryOnly`     | Installed EXE/ASAR hashes, live process, renderer hydration, no E2E/debug overrides                                                        |

The diagnostic PASS did **not** execute the full install-and-ordinary wrapper in
one pass. Installation evidence belongs to the private root; the final diagnostic
and ordinary startup are separate attempts. `install.cmd` was unchanged. Earlier
failed attempts and the historical [recovery report](./recovery-20261013.md) remain
retained. [native-scoped-evidence.json](./native-scoped-evidence.json) contains only
curated outcomes, fixed fixture labels, origin-only loopback attribution and
package identity; logs, screenshots, DOM controls and host paths remain private.

## Tracked corrections and differences

- The install wrapper now clears debug overrides, supports ordinary-only reuse,
  checks shared-read renderer hydration, propagates diagnostic failure, and leaves
  ordinary startup for normal Windows shutdown rather than forcing termination.
- The CDP harness now navigates from restored Project Map/Settings state, observes
  WebSockets, preserves controlled fetch evidence even on rejection, checks query
  redaction, provider denial and security preferences, and retains request evidence
  on failures. Diagnostic close failure sets a nonzero exit.
- The retained retry wrapper recorded the probe exit but **did not propagate it**.
  The new tracked retry wrapper adds an output parameter, clears inherited debug
  overrides before launching, clears its Node launcher environment after completion
  and exits with the probe code. These changes were not
  native-executed; the existing PASS is grounded in probe exit and cleanup artifacts.
- The retained CDP script treated every screenshot exception as a timeout. The
  tracked version tolerates only `TimeoutError`, recording other errors as FAIL
  and propagating them. The passing run's two screenshot artifacts are BLOCKED;
  no retroactive claim about the exact exception type is made. This tightening was
  not native-executed. Other differences in this script are formatting only.

The provenance manifest explicitly marks script source equivalence after newline
normalization; do not equate a false entry with a native-tested revision. Git's
stored source uses LF, while staged files may use CRLF.

## Acceptance boundaries and reproduction requirements

Use fresh private output directories for subsequent attempts; these scripts do
not reject or clear old evidence. Stage the versioned scripts and matching pinned
installer plus the retained Playwright dependency. `retry.cmd` runs diagnostics
against the installed package; `ordinary.cmd` runs ordinary-only validation. Set
the PowerShell output parameter to a fresh private share subdirectory when calling
the wrappers directly. Ordinary startup checks the Corporate profile as well as
installed hashes; the retry wrapper checks hashes, while the prior install and
ordinary artifacts establish the profile.

Require result PASS **and** probe exit 0 **and** graceful diagnostic cleanup true.
The result is written before cleanup. Ordinary-startup's cleanup string records
the intended shutdown procedure, not completed VM cleanup; actual normal shutdown,
poweroff and temporary-share removal were separately verified in the final report.
No script issues forced process termination or VM poweroff.

CDP attaches after the initial window exists, so its evidence supports Settings
scope, not startup-wide or OS-wide zero egress. The controlled loopback transfer
completed: observer `disabled` is classification, not transport-block evidence.
Invoke CJS through the final PowerShell wrappers, which clear debug overrides.
The retained executed retry wrapper did not clear inherited `NODE_OPTIONS`;
CJS itself filters the other debug overrides but retains `NODE_OPTIONS`. The
ordinary-final artifact confirms a clean ordinary environment, not the original
retry launch environment. This is another limitation of the retrospective record.

The missing launch-time hash manifest, retrospective dependency identity and
unexecuted wrapper/screenshot tightening prevent claiming byte-for-byte native
acceptance of every final tracked harness byte. They do not demonstrate a new
production defect or invalidate the scoped artifacts. Final PR HEAD CI and review
must be assessed separately. #126, #119 and Phase 2 stay open; no merge or production
release approval is implied.
