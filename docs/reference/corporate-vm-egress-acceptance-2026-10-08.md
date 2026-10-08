# PR #96 VM acceptance pass — 2026-10-08

This pass implements a fail-closed real VM acceptance command. **Real VM acceptance was not
executed successfully. #92 and #14 remain open; PR #96 is not ready to merge on the full #92 claim.**
The accepted Host harness was preserved and its complete dedicated command passed again.

| Required report item | Result |
| --- | --- |
| 1. Starting PR head | `208fa7d4415484d3ffe7b02e3385b27e0f5cc703` |
| 2. Final PR head | The commit containing this report; exact SHA supplied in the handoff after push. |
| 3. Files changed | Package scripts, Vitest inclusion, prerequisite runner/tests, guest firewall/evidence/tests, real VM E2E and fixtures/tests, continuous guest exec trace, dedicated workflow and VM gate documentation. |
| 4. Existing infrastructure reused | Product ephemeralVm doctor/provision/cleanup and suspendWorkspace/resumeWorkspace APIs; underlying provisionEphemeralVmRuntime, cleanupEphemeralVmRuntime, suspendEphemeralVmRuntime, resumeEphemeralVmRuntime; existing recipe runner, persistence, runtime SSH attachment, product SSH PTY execution and hidden Electron fixture. |
| 5. Actual provider/recipe used | None executed. Inspected tracked Multipass Ubuntu LTS recipe; Multipass absent. VirtualBox installed with only a stopped Windows test VM. No Linux acceptance recipe/image configured. |
| 6. Provision | NOT RUN: required command fails prerequisite detection. |
| 7. Runtime identity/status/mode | No runtime created; no runtime ID, environment ID or SSH target ID. Supported acceptance path is real Linux/direct SSH. |
| 8. Observation | Temporary guest iptables/ip6tables OUTPUT/FORWARD guard; kernel destination logs reconciled with counters and hook/completion integrity. Continuous tracefs sched_process_exec launch observation. Actual guest execution remains unverified. |
| 9. Control exclusions | Established/related, loopback, exact SSH peer IP/port discovered from SSH_CONNECTION, dynamic reverse-forwarded Host-local sentinel. Sentinel NEW traffic is logged before loopback exemption. No assumed subnet. |
| 10. Idle duration | Implemented 30 seconds; not measured in a real VM here. |
| 11. VM idle unexpected egress | UNKNOWN / unmeasured. Never reported as zero on missing prerequisites. |
| 12. Claude credential-only | Implemented fake credential state in product SSH session; NOT RUN in real VM. |
| 13. Codex credential-only | Implemented fake credential state in product SSH session; NOT RUN in real VM. |
| 14–15. Explicit Claude / attribution | Implemented Python stub through product provider-marked SSH PTY, PID marker + sentinel + guest firewall correlation; NOT RUN in real VM. |
| 16–17. Explicit Codex / attribution | Same provider-specific contract; NOT RUN in real VM. |
| 18–19. Explicit SCM / attribution | Implemented VM Git fetch against local Host Git HTTP fixture; Git PID + fixture requests + firewall correlation. Local fixture semantic test executes a real Git fetch; VM routing NOT RUN. |
| 20. Forbidden synthetic | Hermetic rejection tests PASS; guest documentation-IP rejection and synthetic shared-contract cases implemented, NOT RUN in real VM. No forbidden service contacted. |
| 21. Suspend/resume | NOT RUN. Implemented if both lifecycle commands exist, followed by new guard and 30-second idle observation; unsupported recipes report explicit skip. |
| 22. Cleanup | No real VM/rules/credentials/SSH target created by acceptance. Host/local semantic test resources cleaned. Real-VM finally cleanup implemented and partial-install cleanup covered hermetically. |
| 23. Host regression | PASS: Host observer tests and all 3 dedicated Corporate E2Es (lifecycle/idle/credentials, support links, explicit providers). Host unexpected egress remains 0. |
| 24. Scanner | PASS: 12,325 scanned files, baseline 0 / new violations 0. Scanner, ceiling and exclusions unchanged. |
| 25. Typecheck | PASS: pnpm run typecheck (node/CLI/web). Whole E2E typecheck retains existing unrelated errors; changed VM files checked separately for no new diagnostics. |
| 26. Tests/E2E | 77 tests across 10 targeted suites PASS, including guest/prerequisite/local fixture semantics and #89/Host/recipe/routing units. Existing VM service tests fail on this Windows host with /bin/sh ENOENT and fsync EPERM; no production fix attempted. Docker/nested SSH E2E blocked by unavailable Docker engine. Changed-code quality PASS with 0 new native/type-aware/React findings; targeted oxlint and diff checks PASS. |
| 27. CI | Fresh PR CI status must be read on the pushed SHA. Local semantic verification is distinct from hosted CI and from real VM acceptance. |
| 28. GitHub-hosted real VM capability | Current PR workflow does not configure a real VM provider, staged Linux image or recipe; its Windows package lane uses windows-2022. It cannot supply this acceptance evidence as configured. |
| 29. Required environment | Dedicated/self-hosted Windows x64 VM-capable runner, staged real Linux provider/image, disposable direct SSH recipe, fake-only test environment, sudo firewall/kernel-log/tracefs access. |
| 30. Acceptance outside CI | Required invocation attempted outside CI; failed at prerequisite detection. No actual guest observation executed. |
| 31. Production changes | None. Host harness and network policy unchanged. No dependencies, scanner exclusions or baseline/ceiling growth. |
| 32. Limitations | Direct Linux SSH topology only; no paired-server/jump-host/proxy recipe acceptance. Independently routed namespace/macvlan execution needs additional boundary observation. Kernel process observation plus stub evidence covers selected provider launch forms, not arbitrary code loaded into an already running interpreter. Real firewall/tracefs behavior requires the pending acceptance run. |
| 33. #92 fully accepted | NO. Host accepted YES; Real VM accepted NO. |
| 34. PR #96 safe to merge | NO for complete #92 acceptance. Do not merge automatically. |
| 35. #14 closable | NO. Keep #14 and #92 open. |

| Plane | Scenario | Result |
| --- | --- | --- |
| Host | cold start; focus/hide/show/restore; Settings/Support; 30-second idle | PASS |
| Host | unexpected egress | 0 |
| VM | provision; ready; 30-second idle | NOT RUN |
| VM | unexpected egress | UNKNOWN |
| VM | Claude/Codex credential-only | NOT RUN |
| VM | Claude/Codex/SCM explicit attribution | NOT RUN |
| VM | cleanup | No VM created; real cleanup NOT RUN |

Real VM release gate automation: **NO**. A required dispatch workflow is provided, but staging a
runner/recipe and wiring the exact-head acceptance result into release protection remain necessary.
See [gate setup](corporate-vm-egress.md). The existing unrelated cross-version wire failure remains
outside this pass.
