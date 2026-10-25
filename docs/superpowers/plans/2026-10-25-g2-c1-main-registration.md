# G2-C1 Main integration plan

Goal: connect separate Main registration and one manual PR/HEAD/Checks read while
keeping production Source disabled. Base: Draft #180 at 59c237096ba780e17ca8d43356aeae90dbbfcab7.

Architecture: reuse B4 registration, B3 Electron authority and one-use grant, fixed
transport operations, B5c provider/composition and G1 final-delivery fence. Derive
HEAD and projection from the same bounded response; cache projection within that
operation so composition adds no supplementary request. No duplicate authority.
Tech stack: TypeScript, Electron Main, Vitest; no dependency changes.

- [x] Verify pinned base, #180 and #183 scope; inspect Main entry points.
- [x] Add failing offline single-response parser/transport tests; implement fixed
      injected executor retaining nonce, deadline, size and current-state checks.
- [x] Add failing real Main integration tests covering separate consent, one call,
      revocation, wrong identity, incomplete Checks, stale scope and reentrancy.
- [x] Connect refreshSelected to B3 and B5c with per-operation cached projection;
      require every readiness gate and lifecycle subscription before registration.
- [x] Wire status-only production Refresh to an absent final sink: no facts sent,
      no native source, credentials or activation added.
- [x] Review diff independently and run focused/broader Vitest, sequential typecheck,
      lint, formatting, changed-quality, scanner and ratchets.
- [ ] Publish Draft stacked on #180 using Connector, verify final-SHA PR Checks and
      test LoC, update #183/#152 without closing issues.

Execution and Draft publication are authorized by the task. #151 OPEN; #153 NOT
EXERCISED; #148 NO-GO. Real credentials, ACL, all lifecycle producers, native
confinement, authenticated HEAD and scoped revocable Renderer sink remain blockers.
Public repository governance discrepancy and #151's 23 controls remain unresolved.
