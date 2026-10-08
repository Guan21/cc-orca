import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export function corporateVmGatePrerequisites(env, exists = existsSync) {
  const repo = env.ORCA_CORPORATE_VM_RECIPE_REPO
  const recipe = env.ORCA_CORPORATE_VM_RECIPE_ID
  if (!repo || !recipe) {
    return { available: false, reason: 'Set ORCA_CORPORATE_VM_RECIPE_REPO and ORCA_CORPORATE_VM_RECIPE_ID for a real Linux VM recipe.' }
  }
  if (!exists(join(resolve(repo), 'orca.yaml'))) {
    return { available: false, reason: 'The configured VM recipe repository must contain orca.yaml.' }
  }
  return { available: true }
}

export async function runCorporateVmGate({ env, required, exists = existsSync, run, report = console.log }) {
  const prerequisites = corporateVmGatePrerequisites(env, exists)
  if (!prerequisites.available) {
    report(`Real Ephemeral VM acceptance: ${required ? 'FAIL' : 'UNAVAILABLE'} — prerequisite missing. ${prerequisites.reason}`)
    return required ? 1 : 2
  }
  return run([
    join(process.cwd(), 'node_modules', '@playwright', 'test', 'cli.js'),
    'test', 'tests/e2e/corporate-vm-egress.spec.ts',
    '--config', 'tests/playwright.config.ts', '--project', 'electron-headless', '--workers=1'
  ], {
    ...env,
    ORCA_BACKGROUND_LAUNCH: '1',
    ORCA_E2E_CORPORATE_BUILD: '1',
    ORCA_CORPORATE_VM_REQUIRED: '1'
  })
}

async function main() {
  const required = process.argv.includes('--required') || process.env.ORCA_CORPORATE_VM_REQUIRED === '1'
  const preflight = corporateVmGatePrerequisites(process.env)
  if (!preflight.available) {
    process.exitCode = await runCorporateVmGate({ env: process.env, required, run: async () => 1 })
    return
  }
  const directory = mkdtempSync(join(tmpdir(), 'orca-vm-gate-runner-'))
  try {
    // Bundle the current process boundary so the gate never depends on a stale app build.
    const { build } = await import('esbuild')
    const output = await build({
      entryPoints: [join(process.cwd(), 'src/shared/child-process/run-process.ts')],
      bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false
    })
    const runnerPath = join(directory, 'run-process.cjs')
    writeFileSync(runnerPath, output.outputFiles[0].contents)
    const { runProcess } = createRequire(import.meta.url)(runnerPath)
    process.exitCode = await runCorporateVmGate({
      env: process.env, required,
      run: async (args, env) => {
        const result = await runProcess({ program: process.execPath, args, env,
          cwd: process.cwd(), timeoutMs: null, stdio: 'inherit' })
        return result.code ?? 1
      }
    })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main()
}
