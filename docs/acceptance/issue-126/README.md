# Issue 126 installed Windows acceptance harness

Latest result: **PASS for scoped native acceptance**; see
[native-completion-20261013.md](./native-completion-20261013.md). Issue #126
remains open pending final PR review. Earlier blocked recovery evidence is retained.
See [harness-reconciliation.md](./harness-reconciliation.md) for execution chains,
[harness-provenance.json](./harness-provenance.json) for retained script hashes,
and the unexecuted differences in the final tracked scripts.

The harness upgrades only the existing isolated Windows 10 VirtualBox acceptance
guest. Run host builds and the guest application with `ORCA_BACKGROUND_LAUNCH=1`.
Keep the VM headless, preserve all snapshots, and retain previous acceptance files.

Stage the installer and these guest scripts in a new `Issue126` directory within
the VM's existing read-only `SecureOrcaLite` artifact share. Supply
`build-manifest.json` with `sourceSHA` and `installerSHA256` from the committed
source build. Add a temporary writable `DevCrew126Output` share directed only to
this run's ignored `private` evidence directory. The previously staged
`Phase2-Issue119-e6748f1-20261012/playwright-core` is reused; no Internet download
or dependency installation occurs in the guest.

Boot using `VBoxManage startvm SecureOrcaLite-Win10-Test --type headless`. Use
`vbox-channel.py run`, `text <command-file>`, and `enter` to invoke
`\\VBOXSVR\SecureOrcaLite\Issue126\install.cmd` through the existing headless
guest keyboard channel. This never activates a host desktop window and needs no
guest credential changes or execution-policy bypass.

`guest-install-retest.ps1` checks installer SHA256, silently upgrades, checks the
Corporate profile, and starts a hidden sandboxed Playwright diagnostic using the
installed executable and existing user profile. It then observes ordinary
production startup without debug flags, polling renderer hydration with a
shared-read log stream. `-OrdinaryOnly` rechecks installed hashes and skips
installation/diagnostics; `-OutputDirectory` isolates each attempt's evidence.
The diagnostic captures raw CDP
request events before opening Settings, performs two General Settings cycles and
90 seconds of scoped idle, and fails on any unexpected non-loopback attempt.
Controlled renderer traffic contacts only an HTTP sentinel bound to guest
loopback. Both independent CDP evidence and a matching runtime renderer record
are mandatory; empty observer output cannot pass. Restricted telemetry, Linear,
and Jira preload methods, unauthorized Cursor execution, and renderer security
preferences must continue enforcing Corporate restrictions. Screenshot timeouts
are recorded separately; DOM/request/attribution checks still must pass.

The diagnostic closes its application when finished. Verify probe exit code 0
and the graceful-close artifact in addition to the test result. Close ordinary
startup through normal Windows shutdown without forcing application closure;
remove only the temporary output share once the VM is powered off. Verify VM state and retained
snapshot identifiers afterwards. Raw logs and masked screenshots stay private;
publish only sanitized destination metadata and test outcomes. Settings capture
does not establish independent startup-wide or OS-wide zero egress.

The required `$electron` skill was absent from installed skill locations during
discovery, as also recorded in the original #119 run. This tooling gap is retained
in the evidence; existing real hidden-renderer Playwright/CDP checks are reused.
Neither this retest nor source checks grant production release approval, close
#119, or mark Phase 2 complete.
