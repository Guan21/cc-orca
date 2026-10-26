# DevCrew promptfoo CI proof of concept

Parent tracking: [#195](https://github.com/Guan21/cc-orca/issues/195) · [#72 Evaluation/Outcome](https://github.com/Guan21/cc-orca/issues/72)

## What this actually does

The `DevCrew promptfoo Evaluation PoC` GitHub Actions workflow in
`.github/workflows/devcrew-promptfoo-eval.yml` runs a **synthetic-only**
promptfoo evaluation using the built-in `echo` provider and fixed, public
test strings. It verifies the promptfoo installation, assertion execution,
JSON/JUnit report export, and GitHub artifact upload path. No Claude Code,
Codex, LLM judge, prompt injection experiment, or DevCrew application is
executed. It **does not establish task completion, code safety, source
authorization, or security-policy compliance**.

- PR trigger: only PRs targeting `company-work` and changing
  `evals/promptfoo/**` or this workflow.
- Optional `workflow_dispatch`: GitHub displays manual dispatch workflows
  when they are present on the **repository default branch** (currently
  `main`). Until then, use a PR against `company-work` to exercise the PoC.
- Workflow is **separate** from the required V1 `PR Checks` job; no
  branch-protection or release gate changes.
- Github-hosted Ubuntu runner with Node 24 and version-pinned
  `promptfoo@0.125.0`. No model keys, no cloud share, no red team, no
  write-scoped token, no self-hosted runner. It downloads the npm package:
  **this setup is not offline**, even though the Echo evaluation itself does
  not call a model API.
- Reports are retained as an Actions artifact for 7 days:
  `results.json`, `results.junit.xml`, `evidence-manifest.json`.
  Raw JSON is potentially sensitive for later real test suites: review/redact
  before expanding this workflow beyond synthetic fixtures.

## Run on a machine with Node.js 24

```sh
node --test evals/promptfoo/evidence-manifest.test.mjs
npx --yes promptfoo@0.125.0 eval \
  -c evals/promptfoo/promptfooconfig.yaml \
  --no-cache --no-share --fail-on-error \
  -o evals/promptfoo/out/results.json \
  -o evals/promptfoo/out/results.junit.xml
```

No secrets are needed. The output directory is gitignored.

## Trust model / future DevCrew integration

The manifest records hashes plus `GITHUB_REPOSITORY`, claimed PR HEAD,
run ID/attempt and evaluation-step outcome. These **metadata fields are
unverified claims inside an artifact**, not authorization or an attested CI
result. A future DevCrew Main-owned adapter must authenticate GitHub source
and permissions independently, pin the exact repo/PR/HEAD/run/artifact
identity, validate checksums and retention/freshness, and handle missing
outputs, stale SHA, cross-project binding, missing/partial checks, replay,
cancellation and revocation. Evaluation failures must never be treated as
policy enforcement or silently promoted to PASS.

No automatic model calls or runtime control are approved under this PoC.
Promptfoo is an Evaluation tool, not an OS sandbox, network firewall or
human reviewer.

## Next steps (not implemented)

1. Connect the limited JSON/JUnit schema to #72 EvaluationEvidence, with a
   reviewed adapter/contract and #71 evidence reference relationships.
2. Under separate privacy/network/Main permission approvals, load real
   sanitized evaluation reports from an approved CI runner.
3. Make #53 Review Queue consume the verified evidence for a bounded PR.
4. Let #185 AI Engineering Manager propose human-reviewed next actions,
   without giving promptfoo any authority to run Agent commands or merge PRs.

The V1 release scope in #47/#148 remains unchanged.
