import { homedir } from 'node:os'
import { assertCorporateSessionHistoryPaths } from '../../shared/corporate-session-history-policy'
import { AGENT_ROOT_ENV_ALLOWLIST } from './session-scanner-service-env'
import type { AiVaultScanOptions } from './session-scanner-types'

export function assertLocalSessionHistoryScanPaths(options: AiVaultScanOptions = {}): void {
  assertCorporateSessionHistoryPaths([
    homedir(),
    ...AGENT_ROOT_ENV_ALLOWLIST.map((key) => process.env[key]),
    ...Object.values(options).flatMap((value) =>
      typeof value === 'string'
        ? [value]
        : Array.isArray(value)
          ? value.filter((path): path is string => typeof path === 'string')
          : []
    )
  ])
}
