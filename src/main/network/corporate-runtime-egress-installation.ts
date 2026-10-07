import type { Shell } from 'electron'
import {
  CORPORATE_RUNTIME_EGRESS_BLOCK_INTERNET_ENV,
  CORPORATE_RUNTIME_EGRESS_LOG_PATH_ENV,
  CORPORATE_RUNTIME_EGRESS_SUPPRESS_EXTERNAL_ENV,
  recordRuntimeEgressAttempt,
  setRuntimeEgressScenario,
  getRuntimeEgressLifecycleScenario
} from './corporate-runtime-egress-observer'

type FetchLike = typeof globalThis.fetch

type WebRequestLike = {
  onBeforeRequest: (
    filter: { urls: string[] },
    listener: (
      details: { url: string; resourceType?: string; webContentsId?: number },
      callback: (response: { cancel?: boolean }) => void
    ) => void
  ) => void
}

type SessionLike = {
  readonly webRequest: WebRequestLike
}

let fetchInstalled = false
let shellInstalled = false

export function installCorporateRuntimeEgressObserver(): void {
  if (!isObserverEnabled()) {
    return
  }
  globalThis.__orcaCorporateRuntimeEgressRecord = recordRuntimeEgressAttempt
  globalThis.__orcaCorporateRuntimeEgressSetScenario = setRuntimeEgressScenario
  installFetchObserver()
}

export function installCorporateRuntimeEgressSessionObserver(session: SessionLike): void {
  if (!isObserverEnabled()) {
    return
  }
  session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    const attempt = recordRuntimeEgressAttempt({
      processKind: 'renderer',
      source: 'electron-session-web-request',
      category: 'automatic-app-owned-egress',
      destination: details.url,
      initiatedBy: { kind: 'app-lifecycle', lifecycleState: getRuntimeEgressLifecycleScenario() }
    })
    callback({ cancel: shouldBlockAttempt(attempt) })
  })
}

export function installCorporateRuntimeEgressShellObserver(shell: Shell): void {
  if (!isObserverEnabled() || shellInstalled) {
    return
  }
  shellInstalled = true
  const originalOpenExternal = shell.openExternal.bind(shell)
  const observedOpenExternal: Shell['openExternal'] = async (url, options) => {
    const attempt = recordRuntimeEgressAttempt({
      processKind: 'main',
      source: 'shell.openExternal',
      category: 'user-initiated-egress',
      destination: url,
      initiatedBy: { kind: 'user-action', action: getRuntimeEgressLifecycleScenario() }
    })
    if (process.env[CORPORATE_RUNTIME_EGRESS_SUPPRESS_EXTERNAL_ENV] === '1') {
      return
    }
    if (shouldBlockAttempt(attempt)) {
      throw new Error(`Corporate runtime egress blocked: ${attempt.destination?.normalized ?? url}`)
    }
    await originalOpenExternal(url, options)
  }
  shell.openExternal = observedOpenExternal
}

function installFetchObserver(): void {
  if (fetchInstalled || typeof globalThis.fetch !== 'function') {
    return
  }
  fetchInstalled = true
  const originalFetch: FetchLike = globalThis.fetch.bind(globalThis)
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = resolveFetchDestination(input)
    const attempt = recordRuntimeEgressAttempt({
      processKind: 'main',
      source: 'global-fetch',
      category: 'automatic-app-owned-egress',
      destination: url,
      initiatedBy: { kind: 'app-lifecycle', lifecycleState: getRuntimeEgressLifecycleScenario() }
    })
    if (shouldBlockAttempt(attempt)) {
      throw new Error(`Corporate runtime egress blocked: ${attempt.destination?.normalized ?? url}`)
    }
    return originalFetch(input, init)
  }) as FetchLike
}

function shouldBlockAttempt(attempt: RuntimeEgressAttempt): boolean {
  if (process.env[CORPORATE_RUNTIME_EGRESS_BLOCK_INTERNET_ENV] !== '1') {
    return false
  }
  return Boolean(attempt.destination && !attempt.destination.loopback)
}

function isObserverEnabled(): boolean {
  return Boolean(process.env[CORPORATE_RUNTIME_EGRESS_LOG_PATH_ENV])
}

function resolveFetchDestination(input: RequestInfo | URL): string | URL | null {
  if (typeof input === 'string' || input instanceof URL) {
    return input
  }
  return input.url
}
