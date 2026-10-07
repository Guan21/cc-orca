import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CORPORATE_RUNTIME_EGRESS_BLOCK_INTERNET_ENV,
  CORPORATE_RUNTIME_EGRESS_LOG_PATH_ENV
} from './corporate-runtime-egress-observer'

const ORIGINAL_FETCH = globalThis.fetch
const ORIGINAL_LOG_PATH = process.env[CORPORATE_RUNTIME_EGRESS_LOG_PATH_ENV]
const ORIGINAL_BLOCK_INTERNET = process.env[CORPORATE_RUNTIME_EGRESS_BLOCK_INTERNET_ENV]

let tmpDir: string | null = null

describe('Corporate runtime egress installation', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH
    restoreEnv(CORPORATE_RUNTIME_EGRESS_LOG_PATH_ENV, ORIGINAL_LOG_PATH)
    restoreEnv(CORPORATE_RUNTIME_EGRESS_BLOCK_INTERNET_ENV, ORIGINAL_BLOCK_INTERNET)
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true })
      tmpDir = null
    }
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it('observes global fetch without replacing the returned response semantics', async () => {
    const logPath = useRuntimeEgressLog()
    const originalResponse = new Response('ok')
    const fetchMock = vi.fn<typeof fetch>(async () => originalResponse)
    globalThis.fetch = fetchMock

    const { installCorporateRuntimeEgressObserver } = await import(
      './corporate-runtime-egress-installation'
    )
    installCorporateRuntimeEgressObserver()

    const response = await fetch('https://api.example.test/status')

    expect(response).toBe(originalResponse)
    expect(await response.text()).toBe('ok')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(readLoggedAttempts(logPath)).toMatchObject([
      {
        process: { kind: 'main' },
        source: 'global-fetch',
        category: 'automatic-app-owned-egress',
        destination: {
          normalized: 'https://api.example.test:443',
          loopback: false
        }
      }
    ])
  })

  it('blocks non-loopback global fetch before starting the original request', async () => {
    useRuntimeEgressLog()
    process.env[CORPORATE_RUNTIME_EGRESS_BLOCK_INTERNET_ENV] = '1'
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('unexpected'))
    globalThis.fetch = fetchMock

    const { installCorporateRuntimeEgressObserver } = await import(
      './corporate-runtime-egress-installation'
    )
    installCorporateRuntimeEgressObserver()

    await expect(fetch('https://api.example.test/status')).rejects.toThrow(
      'Corporate runtime egress blocked: https://api.example.test:443'
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

function useRuntimeEgressLog(): string {
  tmpDir = mkdtempSync(join(tmpdir(), 'orca-runtime-egress-'))
  const logPath = join(tmpDir, 'egress.jsonl')
  process.env[CORPORATE_RUNTIME_EGRESS_LOG_PATH_ENV] = logPath
  delete process.env[CORPORATE_RUNTIME_EGRESS_BLOCK_INTERNET_ENV]
  return logPath
}

function readLoggedAttempts(logPath: string): unknown[] {
  return readFileSync(logPath, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as unknown)
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name]
    return
  }
  process.env[name] = value
}
