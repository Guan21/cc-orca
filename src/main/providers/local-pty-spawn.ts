import { randomUUID } from 'node:crypto'
import { win32 as pathWin32 } from 'node:path'
import * as pty from 'node-pty'
import { SessionNotFoundError } from '../daemon/daemon-errors'
import { prepareMacosTccLoginShell } from './macos-tcc-login-shell'
import { finalizeLocalPtySpawnEnvironment } from './local-pty-finalize-environment'
import { normalizeLocalCallerSessionId } from './local-pty-launch-helpers'
import { createLocalPtyLaunchPlan, DeferredLocalPtyLaunchPlan } from './local-pty-launch-plan'
import type { LocalPtyProviderOptions } from './local-pty-provider-types'
import {
  addPtyCleanupCallback,
  allocatePtyId,
  ptyShutdownOperations
} from './local-pty-provider-state'
import { activateLocalPtySession } from './local-pty-session-activation'
import {
  buildLocalPtySpawnEnvironment,
  enforceLocalPtySpawnEnvironmentOverrides
} from './local-pty-spawn-environment'
import { awaitCancelableLocalPtySpawn, reattachLocalPty } from './local-pty-spawn-state'
import { spawnShellWithFallback } from './local-pty-utils'
import { updateHistoryEnvForFallback, type HistoryInjectionResult } from '../terminal-history'
import type { PtySpawnOptions, PtySpawnResult } from './types'
import { assertAgentLaunchAllowedForBuildProfile } from '../../shared/corporate-build-profile'
import {
  disposePreparedAgentExecutionRuntime,
  prepareAgentExecutionBoundaryForPtySpawn,
  type PreparedAgentExecutionRuntime
} from '../agent-execution-boundary/agent-execution-boundary'

export async function spawnLocalPty(
  args: PtySpawnOptions,
  getOptions: () => LocalPtyProviderOptions
): Promise<PtySpawnResult> {
  const reattachId = normalizeLocalCallerSessionId(args.sessionId, args.attachOnly === true)
  if (reattachId) {
    const pendingShutdown = ptyShutdownOperations.get(reattachId)
    if (pendingShutdown) {
      await pendingShutdown.promise
    }
    const existing = reattachLocalPty(reattachId, args.cols, args.rows)
    if (existing) {
      return existing
    }
  }
  if (args.attachOnly) {
    throw new SessionNotFoundError(args.sessionId ?? '')
  }
  assertAgentLaunchAllowedForBuildProfile({
    command: args.command,
    launchAgent: args.launchAgent
  })
  const preparedResult = prepareAgentExecutionBoundaryForPtySpawn(args, 'local-pty')
  const preparedRuntime = preparedResult instanceof Promise ? await preparedResult : preparedResult
  const spawnArgs = preparedRuntime.spawn
  const id = allocatePtyId(reattachId ?? undefined)
  try {
    return await spawnPreparedLocalPty({
      id,
      incarnationId: randomUUID(),
      spawnArgs,
      preparedRuntime,
      reattachId,
      getOptions
    })
  } catch (error) {
    await disposePreparedAgentExecutionRuntime(preparedRuntime)
    throw error
  }
}

async function spawnPreparedLocalPty(args: {
  id: string
  incarnationId: string
  spawnArgs: PtySpawnOptions
  preparedRuntime: PreparedAgentExecutionRuntime
  reattachId: string | null
  getOptions: () => LocalPtyProviderOptions
}): Promise<PtySpawnResult> {
  const { id, incarnationId, spawnArgs, preparedRuntime, reattachId, getOptions } = args
  const planResult = createLocalPtyLaunchPlan(spawnArgs, getOptions)
  const plan =
    planResult instanceof DeferredLocalPtyLaunchPlan
      ? planResult.finish(await planResult.availability)
      : planResult
  const envResult = buildLocalPtySpawnEnvironment({
    id,
    spawn: spawnArgs,
    getOptions,
    plan
  })
  const finalEnv = envResult instanceof Promise ? await envResult : envResult
  enforceLocalPtySpawnEnvironmentOverrides(spawnArgs, finalEnv)
  const historyResult = finalizeLocalPtySpawnEnvironment({
    spawn: spawnArgs,
    getOptions,
    plan,
    env: finalEnv
  })

  // Why: the async macOS capability probe runs before node-pty exists.
  await awaitCancelableLocalPtySpawn(id, prepareMacosTccLoginShell())
  if (spawnArgs.signal?.aborted) {
    throw new Error('client_disconnected')
  }
  // Why: another same-id request can win while this one awaits preflight; attach before launching a redundant shell.
  const concurrentWinner = reattachId ? reattachLocalPty(id, spawnArgs.cols, spawnArgs.rows) : null
  if (concurrentWinner) {
    await disposePreparedAgentExecutionRuntime(preparedRuntime)
    return concurrentWinner
  }
  const spawnResult = spawnShellWithFallback({
    shellPath: plan.shellPath,
    shellArgs: plan.shellArgs,
    cols: spawnArgs.cols,
    rows: spawnArgs.rows,
    cwd: plan.effectiveCwd,
    env: finalEnv,
    termName: finalEnv.TERM,
    ptySpawn: pty.spawn,
    getShellReadyConfig: plan.getFallbackShellReadyConfig,
    launchEnvKeys: plan.primaryLaunchEnvKeys,
    // Why: on zsh→bash fallback HISTFILE still points to zsh_history; update before spawn so the child inherits it (design doc §8).
    onBeforeFallbackSpawn: historyResult?.historyDir
      ? (env, fallbackShell) =>
          updateHistoryEnvForFallback(env, fallbackShell, historyResult as HistoryInjectionResult)
      : undefined,
    windowsFallbackAttempts: plan.windowsFallbackAttempts
  })
  spawnArgs.onPtySpawnCommitted?.()
  plan.shellPath = spawnResult.shellPath
  // Why: a Windows fallback embeds its startup command in argv; honor the winning shell's delivery flag to avoid a double write.
  if (spawnResult.startupCommandDeliveredInShellArgs !== undefined) {
    plan.startupCommandDeliveredInShellArgs = spawnResult.startupCommandDeliveredInShellArgs
  }
  if (spawnArgs.command && plan.getFallbackShellReadyConfig) {
    plan.shellReadyLaunch = plan.getFallbackShellReadyConfig(plan.shellPath)
  }

  if (process.platform !== 'win32') {
    finalEnv.SHELL = plan.shellPath
  }

  const proc = spawnResult.process
  const spawnedShellIsWsl =
    process.platform === 'win32' && pathWin32.basename(plan.shellPath).toLowerCase() === 'wsl.exe'
  const spawnedWslDistro = spawnedShellIsWsl
    ? (plan.launchWslDistro ?? undefined)
    : process.platform === 'win32'
      ? null
      : undefined
  registerLocalAgentExecutionBoundaryCleanup(id, preparedRuntime)
  return activateLocalPtySession({
    id,
    incarnationId,
    spawn: spawnArgs,
    getOptions,
    plan,
    env: finalEnv,
    proc,
    reportsChildExitStatus: spawnResult.reportsChildExitStatus !== false,
    spawnedWslDistro
  })
}

function registerLocalAgentExecutionBoundaryCleanup(
  id: string,
  runtime: PreparedAgentExecutionRuntime
): void {
  if (!runtime.dispose) {
    return
  }
  addPtyCleanupCallback(id, () => {
    try {
      const disposed = runtime.dispose?.()
      if (disposed instanceof Promise) {
        void disposed.catch((error) => {
          console.warn('[agent-execution-boundary] dispose failed:', error)
        })
      }
    } catch (error) {
      console.warn('[agent-execution-boundary] dispose failed:', error)
    }
  })
}
