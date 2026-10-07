import { readFileSync, writeFileSync } from 'node:fs'

const SCENARIO_FILE_SUFFIX = '.scenario'

export function writeCorporateRuntimeEgressScenario(logPath: string, scenario: string): void {
  try {
    writeFileSync(`${logPath}${SCENARIO_FILE_SUFFIX}`, scenario, 'utf8')
  } catch {
    // Scenario propagation is diagnostic-only; an unavailable sidecar must not affect the app.
  }
}

export function readCorporateRuntimeEgressScenario(
  logPath: string,
  fallback: string
): string {
  try {
    const sidecar = readFileSync(`${logPath}${SCENARIO_FILE_SUFFIX}`, 'utf8').trim()
    if (sidecar.length > 0 && sidecar.length <= 120) {
      return sidecar
    }
  } catch {
    // Fall back to the process-local startup scenario before the sidecar exists.
  }
  return fallback
}
