import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import type { Page } from '@stablyai/playwright-test'
import { expect, test } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'
import {
  CorporateVmGuest,
  CorporateVmSentinel,
  quoteGuest
} from './helpers/corporate-vm-egress-session'
import { getEphemeralVmRecipeResultConnection } from '../../src/shared/ephemeral-vm-recipes'
import type { EphemeralVmRuntimeRecord } from '../../src/shared/ephemeral-vm-runtimes'
import { createVmGuestEgressGuard, classifyGuestAttempt } from '../corporate-vm/guest-egress-guard'
import { createVmProviderExecTrace } from './helpers/corporate-vm-exec-trace'

const recipeRepo = process.env.ORCA_CORPORATE_VM_RECIPE_REPO
const recipeId = process.env.ORCA_CORPORATE_VM_RECIPE_ID
const required = process.env.ORCA_CORPORATE_VM_REQUIRED === '1'

test.use({
  seedTestRepo: false,
  orcaAppExtraEnv: { ORCA_BACKGROUND_LAUNCH: '1' },
  trace: 'off',
  screenshot: 'off',
  video: 'off'
})
test.skip(
  (!recipeRepo || !recipeId) && !required,
  'Real VM prerequisites missing: configure ORCA_CORPORATE_VM_RECIPE_REPO and ORCA_CORPORATE_VM_RECIPE_ID'
)

test('real ephemeral VM has no unattributed Internet egress', async ({ orcaPage }, testInfo) => {
  test.setTimeout(900_000)
  expect(
    Boolean(recipeRepo && recipeId),
    'Required real VM gate cannot pass without recipe prerequisites'
  ).toBe(true)
  await waitForSessionReady(orcaPage)
  const guest = new CorporateVmGuest()
  const sentinel = new CorporateVmSentinel()
  const workspaceId = `corporate-vm-${randomUUID()}`
  let runtime: EphemeralVmRuntimeRecord | null = null
  let guard: ReturnType<typeof createVmGuestEgressGuard> | null = null
  let execTrace: ReturnType<typeof createVmProviderExecTrace> | null = null
  const evidence: Record<string, unknown> = {
    plane: 'vm',
    acceptance: 'NOT ACCEPTED',
    idleDurationSeconds: 30,
    suspendResume: 'not executed',
    cleanup: 'not executed'
  }
  const attempts: unknown[] = []
  const ptys: string[] = []
  try {
    const repoId = await orcaPage.evaluate(async (repoPath) => {
      const result = await window.api.repos.add({ path: repoPath })
      if ('error' in result) {
        throw new Error('VM acceptance recipe repository unavailable')
      }
      await window.__store!.getState().updateSettings({ experimentalEphemeralVms: true })
      return result.repo.id
    }, recipeRepo!)
    const doctor = await orcaPage.evaluate((args) => window.api.ephemeralVm.doctor(args), {
      repoId,
      recipeId: recipeId!
    })
    expect(doctor.ok, 'VM recipe prerequisites must pass; no Docker/mock fallback').toBe(true)
    const result = await orcaPage.evaluate((args) => window.api.ephemeralVm.provision(args), {
      repoId,
      recipeId: recipeId!,
      workspaceId,
      workspaceName: workspaceId
    })
    if (!result.ok) {
      throw new Error('Real VM provisioning failed (recipe output withheld)')
    }
    runtime = result.runtime
    evidence.provision = 'PASS'
    evidence.runtimeId = runtime.id
    evidence.recipeId = runtime.recipeId
    evidence.connectionMode = runtime.connectionMode
    evidence.runtimeEnvironmentId = runtime.runtimeEnvironmentId
    evidence.sshTargetId = runtime.sshTargetId
    expect(runtime.status).toBe('running')
    const connection = getEphemeralVmRecipeResultConnection(runtime.recipeResult)
    if (connection.type !== 'ssh' || !runtime.sshTargetId) {
      throw new Error(
        'VM gate requires a real Linux SSH recipe; paired-server observation is not implemented'
      )
    }
    expect(
      await orcaPage.evaluate(
        (targetId) => window.api.ssh.getState({ targetId }),
        runtime.sshTargetId
      )
    ).toMatchObject({ status: 'connected' })
    await guest.connect(connection.target)
    evidence.vmProvider = await guest.attestRealVm()
    evidence.ready = 'PASS'
    const control = await guest.controlEndpoint()
    evidence.controlExclusions = ['established/related', 'loopback', control]
    await sentinel.start(guest)
    guard = createVmGuestEgressGuard({
      runtimeId: runtime.id,
      sessionId: guest.sessionId,
      controlEndpoints: [control],
      sentinel: { address: '127.0.0.1', port: sentinel.port, protocol: 'tcp' },
      execute: guest.execute
    })
    await guard.install()
    execTrace = createVmProviderExecTrace({ sessionId: guest.sessionId, execute: guest.execute })
    await execTrace.install()
    evidence.launchObservation =
      'continuous guest kernel sched_process_exec; no overwritten records; Node interpreter launches fail quiet scenarios'
    await guest.installStubs(sentinel.port)
    const observeQuiet = async (scenario: string) => {
      const observation = await guard!.observe({ scenario })
      attempts.push(...observation.attempts)
      expect(observation.unexpectedPackets, `Unexpected VM egress during ${scenario}`).toBe(0)
      expect(
        observation.sentinelPackets,
        `Sentinel activity without explicit action during ${scenario}`
      ).toBe(0)
      expect(await guest.launchPid('claude')).toBeNull()
      expect(await guest.launchPid('codex')).toBeNull()
      expect(await guest.providerProcessCounts()).toEqual({ claude: 0, codex: 0 })
      expect(
        (await execTrace!.observeQuiet()).providerLaunches,
        `Provider executable or unattributed Node interpreter launched during ${scenario}`
      ).toEqual([])
      expect(sentinel.requests).toHaveLength(0)
    }
    await observeQuiet('ready')
    const idleStart = performance.now()
    await new Promise((resolve) => setTimeout(resolve, 30_000))
    await observeQuiet('idle')
    evidence.idleDurationSeconds = (performance.now() - idleStart) / 1_000
    evidence.idleUnexpectedEgress = 0
    for (const provider of ['claude', 'codex'] as const) {
      await guest.credentialOnly(provider)
      const credentialSession = await orcaPage.evaluate((args) => window.api.pty.spawn(args), {
        cols: 80,
        rows: 24,
        cwd: connection.projectRoot,
        connectionId: runtime.sshTargetId,
        initiallyHidden: true,
        env: {
          [provider === 'claude' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY']: 'orca-fake-test-key',
          CLAUDE_CONFIG_DIR: `${guest.directory}/claude-home`,
          CODEX_HOME: `${guest.directory}/codex-home`
        }
      })
      expect(credentialSession.id).toMatch(/^ssh:/u)
      ptys.push(credentialSession.id)
      await expect
        .poll(() => guest.credentialSessionPresent(provider), { timeout: 15_000 })
        .toBe(true)
      await new Promise((resolve) => setTimeout(resolve, 5_000))
      await observeQuiet(`${provider}-credential-only`)
      evidence[`${provider}CredentialOnly`] = { launches: 0, egress: 0 }
    }
    await execTrace.remove()
    execTrace = null
    for (const provider of ['claude', 'codex'] as const) {
      const before = sentinel.requests.filter((request) => request.capability === provider).length
      ptys.push(
        await launchInVm(
          orcaPage,
          runtime.sshTargetId,
          connection.projectRoot,
          `python3 ${quoteGuest(`${guest.directory}/${provider}`)}`,
          provider,
          {
            CLAUDE_CONFIG_DIR: `${guest.directory}/claude-home`,
            CODEX_HOME: `${guest.directory}/codex-home`
          }
        )
      )
      await expect
        .poll(
          () =>
            guest.execute(
              `test -f ${quoteGuest(`${guest.directory}/${provider}.done`)} && echo ok || true`
            ),
          { timeout: 30_000 }
        )
        .toBe('ok')
      const pid = await guest.launchPid(provider)
      expect(pid).not.toBeNull()
      expect(sentinel.requests.filter((request) => request.capability === provider)).toHaveLength(
        before + 1
      )
      const observation = await guard.observe({
        scenario: `explicit-${provider}`,
        initiatedBy: {
          kind: 'provider-operation',
          provider,
          operation: 'explicit test provider action'
        },
        processEvidence: { executable: 'python3', provider, pid: pid! }
      })
      attempts.push(...observation.attempts)
      expect(observation.unexpectedPackets).toBe(0)
      expect(observation.sentinelPackets).toBeGreaterThan(0)
      evidence[`${provider}Explicit`] = {
        result: 'PASS',
        pid,
        attribution: 'VM launch marker + sentinel request + guest firewall',
        destination: `127.0.0.1:${sentinel.port}`
      }
    }
    ptys.push(
      await launchInVm(
        orcaPage,
        runtime.sshTargetId,
        connection.projectRoot,
        `git -C ${quoteGuest(`${guest.directory}/scm`)} fetch origin main & pid=$!; printf '%s' "$pid" > ${quoteGuest(`${guest.directory}/git.launch`)}; wait "$pid" && printf ok > ${quoteGuest(`${guest.directory}/git.done`)}`
      )
    )
    await expect
      .poll(
        () =>
          guest.execute(`test -f ${quoteGuest(`${guest.directory}/git.done`)} && echo ok || true`),
        { timeout: 30_000 }
      )
      .toBe('ok')
    expect(sentinel.requests.some((request) => request.capability === 'scm')).toBe(true)
    const gitPid = Number(await guest.execute(`cat ${quoteGuest(`${guest.directory}/git.launch`)}`))
    const scmObservation = await guard.observe({
      scenario: 'explicit-scm',
      initiatedBy: { kind: 'user-action', action: 'explicit SCM fetch' },
      processEvidence: { executable: 'git', pid: gitPid }
    })
    attempts.push(...scmObservation.attempts)
    expect(scmObservation.unexpectedPackets).toBe(0)
    expect(scmObservation.sentinelPackets).toBeGreaterThan(0)
    evidence.scmExplicit = {
      result: 'PASS',
      pid: gitPid,
      attribution: 'VM Git launch PID + local Git HTTP fixture + guest firewall'
    }
    // Documentation-only IP: no forbidden public service is contacted.
    await guest.execute(
      "python3 - <<'PY'\nimport socket\ns = socket.socket(); s.settimeout(2)\ntry:\n s.connect(('203.0.113.10', 443)); raise RuntimeError('guard failed')\nexcept OSError:\n pass\nfinally:\n s.close()\nPY"
    )
    const forbidden = await guard.observe({
      scenario: 'forbidden-synthetic',
      initiatedBy: {
        kind: 'background-task',
        operation: 'test-only forbidden synthetic validation'
      }
    })
    attempts.push(...forbidden.attempts)
    expect(forbidden.unexpectedPackets).toBeGreaterThan(0)
    expect(forbidden.rejectedPackets).toBeGreaterThan(0)
    const denied = forbidden.attempts.find(
      (attempt) => attempt.destination?.address === '203.0.113.10'
    )
    expect(denied, 'Guest rejection must contain the synthetic destination').toBeDefined()
    for (const syntheticDestination of [
      'https://fixture.onorca.dev',
      'https://github.com/stablyai/orca',
      'https://github.com/stablyai/orca-plugins',
      'https://us.i.posthog.com',
      'https://discord.gg/fixture',
      'https://x.com/orca_build',
      'https://twitter.com/orca_build'
    ]) {
      const synthetic = classifyGuestAttempt({
        runtimeId: runtime.id,
        scenario: 'forbidden-synthetic',
        sentinel: { address: '127.0.0.1', port: sentinel.port, protocol: 'tcp' },
        destination: denied!.destination,
        disposition: 'rejected',
        syntheticDestination
      })
      expect(synthetic.expected).toBe(false)
      expect(synthetic.category).toBe('forbidden-legacy-implicit-dependency')
      attempts.push(synthetic)
    }
    evidence.forbiddenSynthetic = 'BLOCKED / FAIL-AS-EXPECTED'
    evidence.unexpectedEgress = 0
    if (runtime.recipe?.suspend && runtime.recipe.resume) {
      for (const id of ptys.splice(0)) {
        await orcaPage.evaluate((id) => window.api.pty.kill(id), id)
      }
      await guard.remove()
      guard = null
      await guest.removeFixtures()
      await guest.disconnect()
      const suspended = await orcaPage.evaluate(
        (workspaceId) => window.api.ephemeralVm.suspendWorkspace({ workspaceId }),
        workspaceId
      )
      expect(suspended?.status).toBe('suspended')
      const resumed = await orcaPage.evaluate(
        (workspaceId) => window.api.ephemeralVm.resumeWorkspace({ workspaceId }),
        workspaceId
      )
      expect(resumed?.status).toBe('running')
      runtime = resumed!
      const resumedConnection = getEphemeralVmRecipeResultConnection(runtime.recipeResult)
      if (resumedConnection.type !== 'ssh') {
        throw new Error('Resumed VM lost SSH connection')
      }
      await guest.connect(resumedConnection.target)
      await sentinel.stop()
      await sentinel.start(guest)
      guard = createVmGuestEgressGuard({
        runtimeId: runtime.id,
        sessionId: guest.sessionId,
        controlEndpoints: [await guest.controlEndpoint()],
        sentinel: { address: '127.0.0.1', port: sentinel.port, protocol: 'tcp' },
        execute: guest.execute
      })
      await guard.install()
      execTrace = createVmProviderExecTrace({ sessionId: guest.sessionId, execute: guest.execute })
      await execTrace.install()
      await new Promise((resolve) => setTimeout(resolve, 30_000))
      const afterResume = await guard.observe({ scenario: 'resume-idle' })
      attempts.push(...afterResume.attempts)
      expect(afterResume.unexpectedPackets).toBe(0)
      expect(afterResume.sentinelPackets).toBe(0)
      expect((await execTrace.observeQuiet()).providerLaunches).toEqual([])
      evidence.suspendResume = 'PASS; resumed idle 30s, unexpected egress 0'
    } else {
      evidence.suspendResume = 'SKIPPED; selected recipe does not support suspend/resume'
    }
    const finalObservation = await guard.observe({ scenario: 'final-idle' })
    attempts.push(...finalObservation.attempts)
    expect(finalObservation.unexpectedPackets).toBe(0)
    expect(finalObservation.sentinelPackets).toBe(0)
    evidence.acceptance = 'PASS pending cleanup'
  } finally {
    const failures: string[] = []
    if (execTrace) {
      await execTrace.remove().catch(() => failures.push('guest exec trace cleanup'))
    }
    for (const id of ptys) {
      await orcaPage
        .evaluate((id) => window.api.pty.kill(id), id)
        .catch(() => failures.push('VM PTY cleanup'))
    }
    if (guard) {
      await guard.remove().catch(() => failures.push('guest firewall cleanup'))
    }
    if (runtime) {
      await guest.removeFixtures().catch(() => failures.push('guest fixture cleanup'))
    }
    guest.client.end()
    await sentinel.stop().catch(() => failures.push('sentinel cleanup'))
    if (runtime) {
      const cleaned = await orcaPage
        .evaluate((runtimeId) => window.api.ephemeralVm.cleanup({ runtimeId }), runtime.id)
        .catch(() => null)
      if (cleaned?.status !== 'cleaned' || cleaned.cleanupStatus !== 'succeeded') {
        failures.push('product VM cleanup')
      }
      const remaining = await orcaPage
        .evaluate(() => window.api.ssh.listTargets())
        .catch(() => null)
      if (!remaining || remaining.some((target) => target.id === runtime?.sshTargetId)) {
        failures.push('runtime SSH target cleanup')
      }
    }
    evidence.cleanup = failures.length ? failures : 'PASS'
    if (evidence.acceptance === 'PASS pending cleanup' && failures.length === 0) {
      evidence.acceptance = 'PASS'
    }
    writeFileSync(
      testInfo.outputPath('vm-egress-attempts.jsonl'),
      attempts.map((attempt) => JSON.stringify(attempt)).join('\n')
    )
    writeFileSync(
      testInfo.outputPath('vm-egress-acceptance.json'),
      JSON.stringify(evidence, null, 2)
    )
    expect(failures, 'All VM test resources must be cleaned even on failure').toEqual([])
  }
})

async function launchInVm(
  page: Page,
  connectionId: string,
  cwd: string,
  command: string,
  launchAgent?: 'claude' | 'codex',
  env?: Record<string, string>
): Promise<string> {
  const spawned = await page.evaluate((args) => window.api.pty.spawn(args), {
    cols: 80,
    rows: 24,
    cwd,
    command,
    commandDelivery: 'provider' as const,
    connectionId,
    launchAgent,
    env,
    initiallyHidden: true
  })
  expect(spawned.id, 'Process must belong to the product SSH execution host').toMatch(/^ssh:/u)
  return spawned.id
}
