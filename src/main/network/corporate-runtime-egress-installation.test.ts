import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CORPORATE_RUNTIME_EGRESS_BLOCK_INTERNET_ENV,
  CORPORATE_RUNTIME_EGRESS_LOG_PATH_ENV,
  type RuntimeEgressAttempt
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

    const { installCorporateRuntimeEgressObserver } =
      await import('./corporate-runtime-egress-installation')
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

    const { installCorporateRuntimeEgressObserver } =
      await import('./corporate-runtime-egress-installation')
    installCorporateRuntimeEgressObserver()

    await expect(fetch('https://api.example.test/status')).rejects.toThrow(
      'Corporate runtime egress blocked: https://api.example.test:443'
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('records renderer attempts after the startup proxy guard is reinstalled', async () => {
    const logPath = useRuntimeEgressLog()
    const { installElectronProxyRequestGuard } = await import('./electron-proxy-request-guard')
    const { resetSessionProxyApplicationForTests } = await import('./proxy-settings')
    const { setRuntimeEgressScenario, assertNoUnexpectedCorporateEgress } =
      await import('./corporate-runtime-egress-observer')
    const session = createRendererSession()
    resetSessionProxyApplicationForTests(session as never)
    installElectronProxyRequestGuard(session as never)
    installElectronProxyRequestGuard(session as never)
    setRuntimeEgressScenario('open-settings')
    const callback = vi.fn()

    session.request('https://favicon.example.test/icon?secret=sanitized', callback)

    expect(callback).toHaveBeenCalledExactlyOnceWith({})
    const attempts = readLoggedAttempts(logPath)
    expect(attempts).toMatchObject([
      {
        scenario: 'open-settings',
        process: { kind: 'renderer' },
        source: 'electron-session-web-request',
        category: 'automatic-app-owned-egress',
        destination: { normalized: 'https://favicon.example.test:443', loopback: false },
        initiatedBy: { kind: 'app-lifecycle', lifecycleState: 'open-settings' }
      }
    ])
    expect(assertNoUnexpectedCorporateEgress(attempts)).toMatchObject([{ kind: 'unexpected' }])
    expect(readFileSync(logPath, 'utf8')).not.toContain('secret')
  })

  it('records denied renderer attempts while preserving proxy and loopback policy', async () => {
    const logPath = useRuntimeEgressLog()
    process.env[CORPORATE_RUNTIME_EGRESS_BLOCK_INTERNET_ENV] = '1'
    const { installElectronProxyRequestGuard } = await import('./electron-proxy-request-guard')
    const { resetSessionProxyApplicationForTests, retireProxySessionApplication } =
      await import('./proxy-settings')
    const session = createRendererSession()
    resetSessionProxyApplicationForTests(session as never)
    installElectronProxyRequestGuard(session as never)
    const denied = vi.fn()
    session.request('https://blocked.example.test/icon', denied)
    expect(denied).toHaveBeenCalledExactlyOnceWith({ cancel: true })
    const loopback = vi.fn()
    session.request('http://127.0.0.1:4321/status', loopback)
    expect(loopback).toHaveBeenCalledExactlyOnceWith({})
    await retireProxySessionApplication(session as never)
    const retired = vi.fn()
    session.request('http://127.0.0.1:4321/status', retired)
    expect(retired).toHaveBeenCalledExactlyOnceWith({ cancel: true })
    expect(readLoggedAttempts(logPath)).toHaveLength(3)
  })

  it.each(['ws', 'wss'])(
    'observes and blocks %s attempts while allowing loopback',
    async (scheme) => {
      const logPath = useRuntimeEgressLog()
      process.env[CORPORATE_RUNTIME_EGRESS_BLOCK_INTERNET_ENV] = '1'
      const { installElectronProxyRequestGuard } = await import('./electron-proxy-request-guard')
      const session = createRendererSession()
      installElectronProxyRequestGuard(session as never)
      const denied = vi.fn()
      session.request(`${scheme}://socket.example.test/events?secret=redacted`, denied)
      expect(denied).toHaveBeenCalledExactlyOnceWith({ cancel: true })
      const loopback = vi.fn()
      session.request(`${scheme}://127.0.0.1:4321/events`, loopback)
      expect(loopback).toHaveBeenCalledExactlyOnceWith({})
      expect(readLoggedAttempts(logPath)).toMatchObject([
        {
          process: { kind: 'renderer' },
          source: 'electron-session-web-request',
          destination: { scheme, hostname: 'socket.example.test', loopback: false }
        },
        { destination: { scheme, hostname: '127.0.0.1', port: 4321, loopback: true } }
      ])
      expect(readFileSync(logPath, 'utf8')).not.toContain('secret')
    }
  )

  it('does not record local resources or register a competing listener', async () => {
    const logPath = useRuntimeEgressLog()
    const { installCorporateRuntimeEgressObserver } =
      await import('./corporate-runtime-egress-installation')
    const { installElectronProxyRequestGuard } = await import('./electron-proxy-request-guard')
    const { resetSessionProxyApplicationForTests } = await import('./proxy-settings')
    const session = createRendererSession()
    resetSessionProxyApplicationForTests(session as never)
    installElectronProxyRequestGuard(session as never)
    installCorporateRuntimeEgressObserver()
    const callback = vi.fn()
    session.request('file:///app/assets/icon.svg', callback)
    session.request('data:image/svg+xml,local', callback)
    expect(callback.mock.calls).toEqual([[{}], [{}]])
    expect(session.webRequest.onBeforeRequest).toHaveBeenCalledTimes(1)
    expect(() => readFileSync(logPath)).toThrow()
  })

  it('records requests immediately while waiting for proxy readiness', async () => {
    const logPath = useRuntimeEgressLog()
    const { installElectronProxyRequestGuard } = await import('./electron-proxy-request-guard')
    const { resetSessionProxyApplicationForTests, applyProxySettingsToSession } =
      await import('./proxy-settings')
    const session = createRendererSession()
    let finishWrite: (() => void) | undefined
    session.setProxy.mockImplementationOnce(
      () => new Promise<void>((resolve) => (finishWrite = resolve))
    )
    resetSessionProxyApplicationForTests(session)
    installElectronProxyRequestGuard(session as never)
    const applying = applyProxySettingsToSession(
      session,
      { httpProxyUrl: 'http://proxy.example:8080' },
      { env: {} }
    )
    const callback = vi.fn()
    session.request('https://delayed.example.test/status', callback)
    expect(callback).not.toHaveBeenCalled()
    expect(readLoggedAttempts(logPath)).toHaveLength(1)
    await vi.waitFor(() => expect(session.setProxy).toHaveBeenCalledOnce())
    finishWrite?.()
    await applying
    await vi.waitFor(() => expect(callback).toHaveBeenCalledExactlyOnceWith({}))
    expect(readLoggedAttempts(logPath)).toHaveLength(1)
  })

  it('accounts for controlled browser-partition requests through the certificate owner', async () => {
    const logPath = useRuntimeEgressLog()
    process.env[CORPORATE_RUNTIME_EGRESS_BLOCK_INTERNET_ENV] = '1'
    const { BrowserCertificateRequestGuard } =
      await import('../browser/browser-certificate-request-guard')
    const { resetSessionProxyApplicationForTests } = await import('./proxy-settings')
    const session = createRendererSession()
    resetSessionProxyApplicationForTests(session)
    const guard = new BrowserCertificateRequestGuard({ onBlockedMainFrame: vi.fn() })
    guard.installSession(session as never)
    const denied = vi.fn()
    session.request('https://partition.example.test/icon', denied)
    expect(denied).toHaveBeenCalledExactlyOnceWith({ cancel: true })
    expect(readLoggedAttempts(logPath)).toMatchObject([
      {
        process: { kind: 'renderer' },
        source: 'electron-session-web-request',
        destination: { normalized: 'https://partition.example.test:443' }
      }
    ])
  })

  it('keeps observation opt-in when no evidence log is configured', async () => {
    delete process.env[CORPORATE_RUNTIME_EGRESS_LOG_PATH_ENV]
    process.env[CORPORATE_RUNTIME_EGRESS_BLOCK_INTERNET_ENV] = '1'
    const { installElectronProxyRequestGuard } = await import('./electron-proxy-request-guard')
    const session = createRendererSession()
    installElectronProxyRequestGuard(session as never)
    const callback = vi.fn()
    session.request('https://authorized.example.test/app', callback)
    expect(callback).toHaveBeenCalledExactlyOnceWith({})
  })
})

function createRendererSession() {
  type Listener = (
    details: { url: string; resourceType: string; webContentsId: number },
    callback: (response: { cancel?: boolean }) => void
  ) => void
  let listener: Listener | undefined
  return {
    resolveProxy: vi.fn(async () => 'DIRECT'),
    setProxy: vi.fn(async () => {}),
    closeAllConnections: vi.fn(async () => {}),
    webRequest: {
      onBeforeRequest: vi.fn((next: Listener) => {
        // Match Electron's single-listener ownership rather than EventEmitter semantics.
        listener = next
      })
    },
    request: (url: string, callback: (response: { cancel?: boolean }) => void) =>
      listener?.({ url, resourceType: 'image', webContentsId: 42 }, callback)
  }
}

function useRuntimeEgressLog(): string {
  tmpDir = mkdtempSync(join(tmpdir(), 'orca-runtime-egress-'))
  const logPath = join(tmpDir, 'egress.jsonl')
  process.env[CORPORATE_RUNTIME_EGRESS_LOG_PATH_ENV] = logPath
  delete process.env[CORPORATE_RUNTIME_EGRESS_BLOCK_INTERNET_ENV]
  return logPath
}

function readLoggedAttempts(logPath: string): RuntimeEgressAttempt[] {
  return readFileSync(logPath, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as RuntimeEgressAttempt)
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name]
    return
  }
  process.env[name] = value
}
