# Corporate optional VM active-mode egress gate

The authoritative policy remains [Corporate Network Contract](corporate-network-contract.md).
#92 requires the Corporate Host runtime gate, including zero automatic egress when the
optional VM feature is inactive. Real VM active-mode acceptance is a separate feature/security
gate tracked by the follow-up issue linked in the [acceptance boundary](corporate-runtime-egress-acceptance-2026-10-08.md).
Docker/nested-SSH routing and semantic unit tests do not establish real VM acceptance.

Commands:

```text
pnpm run test:corporate-egress
pnpm run test:corporate-egress:vm
pnpm run test:corporate-egress:vm --required
pnpm run test:corporate-egress:all
```

The Host command is unchanged and is the required C5 / #92 gate. The VM command is the
follow-up feature gate. The aggregate explicitly opts into both: Host first, then required real
VM acceptance. It is not a prerequisite for #92 or #14 completion.
Missing VM configuration returns UNAVAILABLE with exit 2 for developer invocation and FAIL
with exit 1 for required acceptance. Configured provisioning, connection, observation or cleanup
failures fail acceptance; there is no Docker/mock fallback.

Configure `ORCA_CORPORATE_VM_RECIPE_REPO` with a disposable recipe repository containing
`orca.yaml` and `ORCA_CORPORATE_VM_RECIPE_ID` with an existing recipe ID. The recipe must
create a fresh real Linux VM, publish an SSH connection with a test identity file and an existing
project root, and support destruction. The recipe runs through the product's existing doctor,
provision, attachment and cleanup APIs; it must not describe a pre-existing personal VM.
Do not point the recipe at a sensitive project. Only fake provider credentials are used.

The tracked launch recipe is Multipass Ubuntu LTS. It is a provider launch artifact, not a
complete configured acceptance repository with an SSH handshake. This test does not invent
another VM lifecycle. Provisioning adapters must emit the existing recipe connection schema.
Only direct SSH Linux recipes are supported by this first gate; paired `orca-server`, jump-host
and proxy-command recipes are not yet covered and fail rather than passing partial acceptance.

Guest prerequisites are `python3`, `git`, `systemd-detect-virt`, `iptables`, `ip6tables`, noninteractive
sudo, readable kernel firewall logs and an already mounted Linux tracefs with the
`sched_process_exec` event. The guest must attest hardware virtualization and reject
container execution. Images and tooling must be staged before the offline observation window.
No packages are installed and no VM image is permanently changed by the test.

Observation uses temporary, uniquely named IPv4/IPv6 OUTPUT and FORWARD chains. Existing rules are retained.
Loopback and established/related packets are exempt; exact discovered SSH control endpoints are
exempt. The Host HTTP sentinel listens on a dynamic loopback port and is reverse-forwarded over
the observer SSH connection to a dynamic guest port. Sentinel NEW connections are observed
before the loopback exemption. All other outbound attempts are logged and rejected. Broad private
subnets are not trusted. Counter deltas are reconciled with tagged kernel records; missing identity
or incomplete observation fails. Rule integrity is checked on every snapshot. This gate covers
direct guest execution and forwarding through the guest's normal network stack; recipes using
macvlan or independently routed network namespaces need additional boundary observation.

The spec observes ready, 30 seconds idle, fake Claude/Codex credential presence without agent
invocation, explicit provider stubs through product SSH PTY execution, and explicit Git fetch
against the Host's local Git HTTP fixture. No provider public endpoints or source-control services
are contacted. Firewall records do not provide process identity: attribution combines scoped stub
PID evidence, explicit product launch metadata, scenario boundaries and local sentinel requests.
Provider stub code runs under Python; the evidence must not be mistaken for kernel-level provider
executable identification. Forbidden synthetic policy cases reuse the #89 vocabulary, paired with
a guest attempt to a documentation-only IP that must be rejected before it leaves the guest.

Suspend/resume runs through product workspace lifecycle APIs when both recipe actions exist;
otherwise evidence records an explicit unsupported skip. The resumed VM gets a fresh guard and
another 30-second idle window. Finally removes guest rules and fake credentials, kills test PTYs,
stops the sentinel and destroys the runtime through product cleanup, including on test failure.
Cleanup failure fails acceptance.

Evidence is written to `test-results/**/vm-egress-acceptance.json` and
`test-results/**/vm-egress-attempts.jsonl`. VM records carry `plane: "vm"`, runtime/recipe and
connection identifiers, scenario, category, initiator, normalized IP/port and correlated PID when
available. Request bodies, credentials, sensitive command lines and repository contents are not
recorded. VM acceptance traces/videos/screenshots are disabled to avoid exporting recipe state.
Credential-only launch evidence combines continuous guest kernel executable tracing, test-stub
launch markers and process snapshots. Trace buffer loss fails the gate; newly executed Node
interpreters fail quiet scenarios rather than being assumed unrelated. Only sanitized executable
names/counts and PIDs leave the guest. This is a deterministic direct provider execution gate,
not a universal audit of arbitrary programs loading provider code into already running interpreters.

CI unit coverage includes `tests/corporate-vm/` and the command prerequisite contract. Existing
Docker/nested-SSH tests remain supporting routing/ownership coverage. The current PR package
lane runs on `windows-2022`; it does not configure a real VM provider, staged Linux image or
acceptance recipe. Hosted CI success is therefore not real VM acceptance.

`.github/workflows/corporate-vm-egress.yml` supplies an explicit dispatch entry point for a
dedicated self-hosted Windows x64 runner labeled `corporate-ephemeral-vm`. Configure repository
variables `CORPORATE_VM_RECIPE_REPO` and `CORPORATE_VM_RECIPE_ID` and stage the provider,
image, test SSH identity and guest tools there. Dispatch on the exact candidate PR head and
retain its sanitized evidence. Merely adding the workflow does not make it an automated required
VM feature release check: runner registration and VM feature release protection integration
remain necessary for the follow-up, independently of the C5 Host release gate.

Local discovery on 2026-10-08 found no Multipass installation or configured Linux recipe. The
installed VirtualBox provider contains only a stopped Windows test machine, which was not reused.
Required real acceptance failed at prerequisite detection, before creating a VM. No real runtime
ID or egress count exists for this run. Real VM active-mode remains NOT YET ACCEPTED and is
tracked separately; missing VM infrastructure does not invalidate accepted Host evidence.
