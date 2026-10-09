import type {
  AiVaultFirstUserPromptArgs,
  AiVaultFirstUserPromptResult
} from '../../shared/ai-vault-types'
import { readAiVaultFirstUserPromptInBackground } from './session-scanner-background'
import {
  assertCorporateSessionHistoryHost,
  assertCorporateSessionHistoryPaths
} from '../../shared/corporate-session-history-policy'

export async function handleAiVaultGetFirstUserPrompt(
  args?: AiVaultFirstUserPromptArgs
): Promise<AiVaultFirstUserPromptResult> {
  assertCorporateSessionHistoryHost(args?.executionHostId)
  assertCorporateSessionHistoryPaths([args?.filePath, args?.codexHome])
  if (!args || typeof args.filePath !== 'string' || typeof args.agent !== 'string') {
    return { prompt: null }
  }
  return readAiVaultFirstUserPromptInBackground({
    agent: args.agent,
    filePath: args.filePath,
    sessionId: typeof args.sessionId === 'string' ? args.sessionId : undefined,
    executionHostId: args.executionHostId,
    codexHome: args.codexHome
  })
}
