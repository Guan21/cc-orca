# Issue 100 renderer audit and cleanup plan

Scope: onboarding, settings, Skills page, English/Japanese copy. Session History is excluded.

A: DevCrew CLI labels already exist; installation copy needs to explain retained launcher names.
B: `orca`, `orca-ide`, `orca-cli`, and `orca.yaml` are executable/skill/config contracts. Preserve literal identifiers and existing data paths.
C: renderer types and internal component identifiers need no migration.
D: Jira/Linear setup actions and cloud Skill sharing/download entry points require authorization; opening settings/Skills must not call them.

Plan: lock Corporate blocked integration and local Skills rendering with regression tests; suppress unauthorized automatic checks and cloud calls; expose local inspection and bundled CLI/orchestration installs only; add localized policy/config/CLI explanations. Reuse existing components and build-profile guard. Backend policy remains authoritative. No new dependencies or data migration.
