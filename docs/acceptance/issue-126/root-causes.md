# Issue 126 verified root causes

Baseline: `e6748f19060d326c12d13042ed864b41a904e165` on `company-work`.

## Automatic icon requests

General Settings renders `OpenInMenuSetting`, which uses
`OpenInApplicationIcon` for configured entries and preset menu entries.
The icon component previously constructed a Google favicon image URL whenever
the configured command matched VS Code, Cursor, or Zed, without checking the
Corporate profile. Native issue 119 evidence independently recorded Google and
gstatic image request attempts during Settings opening. Our new rendering
regression reproduced the remote image and React's remote image preload.

Corporate builds now use the existing local `AppWindow` SVG glyph. Custom
commands already used that glyph and remain local. Preset labels, commands,
draft validation, and explicit Open In Apps execution are unchanged. Default
profile preset rendering is preserved.

## Missing renderer observer records

`initializeReadyFoundation` registered the proxy request guard, then a separate
runtime egress observer on the same default session. Later in startup, it
registered the proxy guard again. Electron supports only the last listener for
each webRequest event, so the final proxy registration silently replaced the
observer. This is independent of the favicon component.

The observer now runs inside existing proxy and certificate request owners,
before proxy readiness waits and cancellation decisions. There is no competing
observer listener. Certificate-owned browser partitions are also observed.
Synthetic tests model Electron's replacement semantics, use controlled URLs
without transport, and check logging, sanitization, wait/cancel decisions,
reinstallation, unexpected egress, and attribution failures. HTTP(S) and
WebSocket attempts are covered. Local files/data do not become network records.

Reference: [Electron webRequest listener ownership](https://www.electronjs.org/docs/latest/api/web-request).

## Boundaries

Logging remains opt-in. No network allowlist, Corporate contract, sandbox,
provider permission, or explicit launch authorization is relaxed. Diagnostic
blocking remains separately opt-in. An observer policy decision is not a claim
about transferred bytes or OS-wide enforcement.

Independent CDP evidence and an actual loopback renderer request attributed by
the installed observer are required by the native retest. Zero records alone
cannot pass. Preview's existing guard ordering issue is outside this fix: its
certificate guard is the effective request owner; this PR does not certify a
preview policy repair. Native results and exact package hashes are recorded
separately after retesting. Issue 119 and Phase 2 remain open; no release approval
or automatic merge is authorized.
