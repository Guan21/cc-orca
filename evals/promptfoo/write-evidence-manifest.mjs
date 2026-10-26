import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE_DIR = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = resolve(BASE_DIR, 'out')
const REPORT_NAMES = ['results.json', 'results.junit.xml']

export function sha256(data) {
  return createHash('sha256').update(data).digest('hex')
}

/**
 * CI workflow metadata is a claim, not an attestation. A future DevCrew Main
 * importer must independently authenticate the repository/run/artifact/HEAD.
 */
export function buildEvidenceManifest({ source, configBytes, reports }) {
  const artifacts = {}
  for (const name of REPORT_NAMES) {
    const bytes = reports[name]
    artifacts[name] = bytes
      ? { present: true, sha256: sha256(bytes) }
      : { present: false }
  }
  return {
    schemaVersion: 1,
    kind: 'synthetic_pipeline_smoke_only',
    authority: 'unverified_ci_artifact',
    evaluator: {
      name: 'promptfoo',
      pinnedVersion: '0.125.0',
      provider: 'echo',
      configSha256: sha256(configBytes)
    },
    source: {
      repository: source.repository,
      pullRequestNumber: source.pullRequestNumber || null,
      headShaClaim: source.headSha,
      githubRunIdClaim: source.runId,
      githubRunAttemptClaim: source.runAttempt
    },
    evaluationStepOutcome: source.stepOutcome,
    artifacts,
    claims: {
      realAgentTested: false,
      modelApiCalled: false,
      policyEnforced: false,
      taskOutcomeVerified: false
    }
  }
}

async function writeManifest() {
  const reports = {}
  for (const name of REPORT_NAMES) {
    try {
      reports[name] = await readFile(resolve(OUTPUT_DIR, name))
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  const configBytes = await readFile(resolve(BASE_DIR, 'promptfooconfig.yaml'))
  const manifest = buildEvidenceManifest({
    source: {
      repository: process.env.GITHUB_REPOSITORY || '',
      pullRequestNumber: process.env.EVAL_PR_NUMBER || '',
      headSha: process.env.EVAL_SOURCE_SHA || '',
      runId: process.env.GITHUB_RUN_ID || '',
      runAttempt: process.env.GITHUB_RUN_ATTEMPT || '',
      stepOutcome: process.env.EVAL_STEP_OUTCOME || 'unknown'
    },
    configBytes,
    reports
  })
  await mkdir(OUTPUT_DIR, { recursive: true })
  await writeFile(resolve(OUTPUT_DIR, 'evidence-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await writeManifest()
}
