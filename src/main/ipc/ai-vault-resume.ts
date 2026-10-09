import { ipcMain } from 'electron'
import type {
  AiVaultPrepareSessionResumeArgs,
  AiVaultPrepareSessionResumeResult,
  AiVaultSessionResumePreparation
} from '../../shared/ai-vault-resume-preparation'
import { parseExecutionHostId } from '../../shared/execution-host'
import { assertLegacyAiVaultResumeAllowed } from '../ai-vault/structured-session-ownership'
import {
  assertCorporateSessionHistoryHost,
  assertCorporateSessionHistoryPaths
} from '../../shared/corporate-session-history-policy'
import {
  assertAgentAllowedForBuildProfile,
  getOrcaBuildProfile
} from '../../shared/corporate-build-profile'
import { wslGatedStat } from '../native-chat/wsl-transcript-fs-access'

export type AiVaultResumeHandlerOptions = {
  ensureStructuredSessionOwnership?: () => Promise<void>
  prepareSessionResume?: AiVaultSessionResumePreparation
  prepareRuntimeSessionResume?: (
    environmentId: string,
    args: AiVaultPrepareSessionResumeArgs
  ) => Promise<AiVaultPrepareSessionResumeResult>
}

export function registerAiVaultResumeHandler(options: AiVaultResumeHandlerOptions): void {
  ipcMain.handle('aiVault:prepareSessionResume', (_event, args: AiVaultPrepareSessionResumeArgs) =>
    prepareAiVaultSessionResume(args, options)
  )
}

export async function prepareAiVaultSessionResume(
  args: AiVaultPrepareSessionResumeArgs,
  options: AiVaultResumeHandlerOptions
): Promise<AiVaultPrepareSessionResumeResult> {
  assertCorporateSessionHistoryHost(args.executionHostId)
  assertCorporateSessionHistoryPaths([args.filePath, args.codexHome])
  assertAgentAllowedForBuildProfile(args.agent)
  if (getOrcaBuildProfile() === 'corporate') {
    const info = await wslGatedStat(args.filePath, 'scan').catch(() => null)
    if (!info?.isFile() || info.size === 0) {
      throw new Error('Session transcript is unavailable. Refresh history and retry.')
    }
  }
  await options.ensureStructuredSessionOwnership?.()
  assertLegacyAiVaultResumeAllowed(args)
  const executionHost = parseExecutionHostId(args.executionHostId)
  if (executionHost?.kind === 'runtime') {
    if (!options.prepareRuntimeSessionResume) {
      throw new Error('The session host is unavailable. Reconnect it and retry resume.')
    }
    return options.prepareRuntimeSessionResume(executionHost.environmentId, args)
  }
  // Why: the desktop process must never materialize transcript paths owned by an SSH host.
  if (executionHost?.kind === 'ssh') {
    return { useRealCodexHome: false }
  }
  return options.prepareSessionResume?.(args) ?? { useRealCodexHome: false }
}
