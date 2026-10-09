# Issue 100: offline Skills cleanup

Bounded plan: lock corporate discovery and forbidden remote calls with regression tests; replace the blanket preload gate with an explicit local operation allowlist; enforce that boundary in main IPC and RPC; install approved bundled guides directly from packaged resources without npx. Keep the broad remote Skills capability disabled. Do not alter Session History or existing user directories.

| Finding                                                | Class | Decision                                                                                                |
| ------------------------------------------------------ | ----- | ------------------------------------------------------------------------------------------------------- |
| Raw Skills capability error on local discovery         | A     | Allow filesystem discovery and local inspection                                                         |
| `orca-cli` skill name and installed instruction topics | B     | Preserve names and aliases                                                                              |
| Runtime skill RPC and IPC identifiers                  | C     | Preserve wire identifiers                                                                               |
| npx/community Skills install and update                | D     | Never launch in Corporate; use packaged trusted guides                                                  |
| Skill cloud sharing, marketplace, downloads            | D     | Fail closed before handler execution                                                                    |
| `orca-linear` and `linear-tickets`                     | D     | Linear API workflows require remote authorization; exclude from Corporate bundled discovery/install/get |
| Existing installed skill directories                   | B     | Read in place; never move/delete automatically                                                          |

Corporate trusted bundled topics are `orca-cli` and `orchestration`. Installation is an explicit local filesystem operation for approved Claude, Codex, or universal skill directories. Existing default-build npx behavior remains unchanged. Installed arbitrary local skills are discoverable; invocation remains subject to agent permissions and the network contract, not an automatic authorization grant.
