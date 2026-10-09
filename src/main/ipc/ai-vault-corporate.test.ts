import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiVaultListResult, AiVaultSession } from '../../shared/ai-vault-types'
import type { IFilesystemProvider } from '../providers/types'
import type * as CachedSessionListModule from '../ai-vault/cached-session-list'
import type * as SessionParseCacheModule from '../ai-vault/session-scanner-parse-cache'
import { getRemoteHostPlatform } from '../ssh/ssh-remote-platform'

const mocks = vi.hoisted(() => ({
  scanAiVaultSessionsInWorker: vi.fn(),
  resolveAiVaultSessionTitlesInWorker: vi.fn(),
  scanRemoteAiVaultSessions: vi.fn(),
  listClaudeSubagentSessions: vi.fn(),
  listOmpSubagentSessions: vi.fn(),
  scanRuntimeAiVaultSessions: vi.fn(),
  getAiVaultWslHomeDirs: vi.fn(),
  getSshFilesystemProvider: vi.fn(),
  getActiveSshAiVaultHostInfo: vi.fn(),
  getActiveSshAiVaultHostInfos: vi.fn(),
  requestActiveSshAiVaultSessionList: vi.fn(),
  requestActiveSshAiVaultSessionTitles: vi.fn(),
  ipcHandle: vi.fn(),
  deleteAiVaultSessionFile: vi.fn(),
  invalidateAiVaultSessionListCache: vi.fn(),
  invalidateSessionParseCacheEntry: vi.fn(),
  transcriptStat: vi.fn()
}))

vi.mock('electron', () => ({
  app: { on: vi.fn() },
  ipcMain: { handle: mocks.ipcHandle }
}))

vi.mock('../native-chat/wsl-transcript-fs-access', () => ({
  wslGatedStat: mocks.transcriptStat
}))

vi.mock('../ai-vault/session-scanner-worker-spawn', () => ({
  scanAiVaultSessionsInWorker: mocks.scanAiVaultSessionsInWorker,
  resolveAiVaultSessionTitlesInWorker: mocks.resolveAiVaultSessionTitlesInWorker,
  resetAiVaultScannerWorkerForTests: vi.fn()
}))

vi.mock('../ai-vault/remote-session-scanner', () => ({
  scanRemoteAiVaultSessions: mocks.scanRemoteAiVaultSessions
}))

vi.mock('../ai-vault/session-scanner-claude-subagents', () => ({
  listClaudeSubagentSessions: mocks.listClaudeSubagentSessions
}))

vi.mock('../ai-vault/session-scanner-omp-subagent-listing', () => ({
  listOmpSubagentSessions: mocks.listOmpSubagentSessions
}))

vi.mock('../ai-vault/session-delete', () => ({
  deleteAiVaultSessionFile: mocks.deleteAiVaultSessionFile
}))

// Why: only the invalidation seam is replaced — everything else (cachedList,
// listAiVaultSessions, ...) keeps its real implementation so the existing
// host-routing/caching tests below stay exercising real behavior.
vi.mock('../ai-vault/cached-session-list', async (importOriginal) => {
  const actual = await importOriginal<typeof CachedSessionListModule>()
  return {
    ...actual,
    invalidateAiVaultSessionListCache: mocks.invalidateAiVaultSessionListCache
  }
})

vi.mock('../ai-vault/session-scanner-parse-cache', async (importOriginal) => {
  const actual = await importOriginal<typeof SessionParseCacheModule>()
  return {
    ...actual,
    invalidateSessionParseCacheEntry: mocks.invalidateSessionParseCacheEntry
  }
})

vi.mock('../wsl', () => ({
  listRunningWslDistrosAsync: vi.fn().mockResolvedValue([]),
  listRunningWslHomeDirsAsync: vi.fn().mockResolvedValue([])
}))

vi.mock('../providers/ssh-filesystem-dispatch', () => ({
  SSH_FILESYSTEM_PROVIDER_UNAVAILABLE_MESSAGE:
    'Remote connection dropped. Click Reconnect on the SSH target before retrying.',
  getSshFilesystemProvider: mocks.getSshFilesystemProvider
}))

vi.mock('./ssh', () => ({
  getActiveSshAiVaultHostInfo: mocks.getActiveSshAiVaultHostInfo,
  getActiveSshAiVaultHostInfos: mocks.getActiveSshAiVaultHostInfos,
  requestActiveSshAiVaultSessionList: mocks.requestActiveSshAiVaultSessionList,
  requestActiveSshAiVaultSessionTitles: mocks.requestActiveSshAiVaultSessionTitles
}))

const { _internals, registerAiVaultHandlers } = await import('./ai-vault')

const provider = {} as IFilesystemProvider

beforeEach(() => {
  vi.clearAllMocks()
  _internals.resetAiVaultCacheForTests()
  mocks.scanAiVaultSessionsInWorker.mockResolvedValue(result([session('local', 'local-session')]))
  mocks.resolveAiVaultSessionTitlesInWorker.mockResolvedValue({ titles: [] })
  mocks.scanRemoteAiVaultSessions.mockResolvedValue(
    result([session('ssh:dev-box', 'remote-session')])
  )
  mocks.listClaudeSubagentSessions.mockResolvedValue({ sessions: [], issues: [] })
  mocks.listOmpSubagentSessions.mockResolvedValue({ sessions: [], issues: [] })
  mocks.scanRuntimeAiVaultSessions.mockResolvedValue(
    result([session('runtime:remote-server', 'runtime-session')])
  )
  mocks.getSshFilesystemProvider.mockReturnValue(provider)
  mocks.requestActiveSshAiVaultSessionList.mockResolvedValue(null)
  mocks.requestActiveSshAiVaultSessionTitles.mockResolvedValue(null)
  mocks.getActiveSshAiVaultHostInfo.mockReturnValue(hostInfo('dev-box'))
  mocks.getActiveSshAiVaultHostInfos.mockReturnValue([hostInfo('dev-box')])
  mocks.transcriptStat.mockResolvedValue({ size: 100, isFile: () => true })
})

afterEach(() => vi.unstubAllEnvs())

describe('Corporate local session history boundary', () => {
  it('refuses remote prompt, subagent and deletion requests before local I/O', async () => {
    registerAiVaultHandlers()
    const args = {
      agent: 'claude',
      filePath: '/session.jsonl',
      parentFilePath: '/session.jsonl',
      executionHostId: 'runtime:host'
    }
    for (const channel of [
      'aiVault:getFirstUserPrompt',
      'aiVault:listSubagentSessions',
      'aiVault:deleteSession'
    ]) {
      await expect(getIpcHandler(channel)({}, args)).rejects.toThrow(
        'Corporate Agent Session History is local-only'
      )
    }
    expect(mocks.transcriptStat).not.toHaveBeenCalled()
    expect(mocks.listClaudeSubagentSessions).not.toHaveBeenCalled()
    expect(mocks.deleteAiVaultSessionFile).not.toHaveBeenCalled()
  })

  it('refuses remote list IPC before initializing ownership or discovering hosts', async () => {
    const ensureStructuredSessionOwnership = vi.fn()
    const getActiveRuntimeAiVaultHostInfos = vi.fn()
    registerAiVaultHandlers({ ensureStructuredSessionOwnership, getActiveRuntimeAiVaultHostInfos })
    await expect(
      getIpcHandler('aiVault:listSessions')({}, { executionHostScope: 'runtime:host' })
    ).rejects.toThrow('Corporate Agent Session History is local-only')
    expect(ensureStructuredSessionOwnership).not.toHaveBeenCalled()
    expect(getActiveRuntimeAiVaultHostInfos).not.toHaveBeenCalled()
  })

  it('refuses external UNC transcript paths before filesystem or title dispatch on Windows', async () => {
    if (process.platform !== 'win32') {
      return
    }
    registerAiVaultHandlers()
    const filePath = '\\\\external-host\\share\\session.jsonl'
    await expect(
      getIpcHandler('aiVault:prepareSessionResume')(
        {},
        {
          agent: 'claude',
          filePath,
          executionHostId: 'local',
          codexHome: null
        }
      )
    ).rejects.toThrow('Network session paths are disabled in corporate builds')
    await expect(
      getIpcHandler('aiVault:getFirstUserPrompt')(
        {},
        {
          agent: 'claude',
          filePath,
          executionHostId: 'local'
        }
      )
    ).rejects.toThrow('Network session paths are disabled in corporate builds')
    await expect(
      _internals.resolveAiVaultSessionTitles({
        requests: [{ agent: 'claude', sessionId: 'session', transcriptPath: filePath }]
      })
    ).rejects.toThrow('Network session paths are disabled in corporate builds')
    expect(mocks.transcriptStat).not.toHaveBeenCalled()
    expect(mocks.resolveAiVaultSessionTitlesInWorker).not.toHaveBeenCalled()
  })

  it.each(['missing', 'empty'] as const)(
    'refuses %s transcript resume with an actionable error',
    async (kind) => {
      const prepareSessionResume = vi.fn()
      registerAiVaultHandlers({ prepareSessionResume })
      if (kind === 'missing') {
        mocks.transcriptStat.mockRejectedValueOnce(new Error('ENOENT'))
      } else {
        mocks.transcriptStat.mockResolvedValueOnce({ size: 0, isFile: () => true })
      }
      await expect(
        getIpcHandler('aiVault:prepareSessionResume')(
          {},
          {
            agent: 'claude',
            filePath: '/missing.jsonl',
            executionHostId: 'local',
            codexHome: null
          }
        )
      ).rejects.toThrow('Session transcript is unavailable. Refresh history and retry.')
      expect(prepareSessionResume).not.toHaveBeenCalled()
    }
  )

  beforeEach(() => vi.stubEnv('ORCA_BUILD_PROFILE', 'corporate'))

  it.each(['local', 'all'] as const)('lists %s without discovering remote hosts', async (scope) => {
    const scanned = await _internals.listAiVaultSessions({
      executionHostScope: scope,
      scopePaths: ['/repo']
    })
    expect(scanned.sessions.map((row) => row.executionHostId)).toEqual(['local'])
    expect(mocks.scanAiVaultSessionsInWorker).toHaveBeenCalledWith(
      expect.objectContaining({ scopePaths: ['/repo'], executionHostId: 'local' }),
      expect.any(AbortSignal)
    )
    expect(mocks.getActiveSshAiVaultHostInfos).not.toHaveBeenCalled()
    expect(mocks.scanRemoteAiVaultSessions).not.toHaveBeenCalled()
    expect(mocks.scanRuntimeAiVaultSessions).not.toHaveBeenCalled()
  })

  it.each(['ssh:dev-box', 'runtime:remote-server', 'invalid', '', null])(
    'refuses remote or malformed list scope %s before dispatch',
    async (scope) => {
      await expect(
        _internals.listAiVaultSessions({ executionHostScope: scope } as never)
      ).rejects.toThrow('Corporate Agent Session History is local-only')
      expect(mocks.scanAiVaultSessionsInWorker).not.toHaveBeenCalled()
      expect(mocks.getActiveSshAiVaultHostInfos).not.toHaveBeenCalled()
      expect(mocks.scanRemoteAiVaultSessions).not.toHaveBeenCalled()
    }
  )

  it('refuses remote titles and resume before any remote callback or ownership initialization', async () => {
    const prepareSessionResume = vi.fn()
    const prepareRuntimeSessionResume = vi.fn()
    const ensureStructuredSessionOwnership = vi.fn()
    const resolveRuntimeAiVaultSessionTitles = vi.fn()
    registerAiVaultHandlers({
      prepareSessionResume,
      prepareRuntimeSessionResume,
      ensureStructuredSessionOwnership,
      resolveRuntimeAiVaultSessionTitles
    })
    for (const host of ['ssh:dev-box', 'runtime:remote-server'] as const) {
      await expect(
        _internals.resolveAiVaultSessionTitles({ executionHostScope: host, requests: [] })
      ).rejects.toThrow('Corporate Agent Session History is local-only')
      await expect(
        getIpcHandler('aiVault:prepareSessionResume')(
          { sender: { id: 99 } },
          {
            agent: 'claude',
            filePath: '/transcript.jsonl',
            codexHome: null,
            executionHostId: host
          }
        )
      ).rejects.toThrow('Corporate Agent Session History is local-only')
    }
    expect(mocks.requestActiveSshAiVaultSessionTitles).not.toHaveBeenCalled()
    expect(resolveRuntimeAiVaultSessionTitles).not.toHaveBeenCalled()
    expect(prepareRuntimeSessionResume).not.toHaveBeenCalled()
    expect(prepareSessionResume).not.toHaveBeenCalled()
    expect(ensureStructuredSessionOwnership).not.toHaveBeenCalled()
  })

  it('preserves permitted local resume preparation and refuses disallowed providers', async () => {
    const prepareSessionResume = vi.fn().mockResolvedValue({ useRealCodexHome: false })
    registerAiVaultHandlers({ prepareSessionResume })
    const args = {
      agent: 'claude',
      filePath: '/session.jsonl',
      codexHome: null,
      executionHostId: 'local'
    }
    await expect(getIpcHandler('aiVault:prepareSessionResume')({}, args)).resolves.toEqual({
      useRealCodexHome: false
    })
    expect(prepareSessionResume).toHaveBeenCalledWith(args)
    prepareSessionResume.mockClear()
    await expect(
      getIpcHandler('aiVault:prepareSessionResume')({}, { ...args, agent: 'gemini' })
    ).rejects.toThrow('AGENT_NOT_ALLOWED_BY_ORG_POLICY')
    expect(prepareSessionResume).not.toHaveBeenCalled()
  })
})

function getIpcHandler(channel: string): (...args: unknown[]) => unknown {
  const registration = mocks.ipcHandle.mock.calls.find(([registered]) => registered === channel)
  if (!registration) {
    throw new Error(`${channel} was not registered`)
  }
  return registration[1]
}

function hostInfo(targetId: string) {
  return {
    targetId,
    executionHostId: `ssh:${targetId}` as const,
    remoteHome: '/home/ada',
    hostPlatform: getRemoteHostPlatform('linux-x64')
  }
}

function result(sessions: AiVaultSession[]): AiVaultListResult {
  return { sessions, issues: [], scannedAt: new Date().toISOString() }
}

function session(
  executionHostId: AiVaultSession['executionHostId'],
  sessionId: string
): AiVaultSession {
  return {
    id: `${executionHostId}:codex:${sessionId}:/tmp/${sessionId}.jsonl`,
    executionHostId,
    agent: 'codex',
    sessionId,
    title: sessionId,
    cwd: '/repo',
    branch: null,
    model: null,
    filePath: `/tmp/${sessionId}.jsonl`,
    codexHome: null,
    createdAt: null,
    updatedAt:
      sessionId === 'runtime-session'
        ? '2026-07-04T03:00:00.000Z'
        : sessionId === 'remote-session'
          ? '2026-07-04T02:00:00.000Z'
          : '2026-07-04T01:00:00.000Z',
    modifiedAt: '2026-07-04T00:00:00.000Z',
    messageCount: 1,
    totalTokens: 0,
    previewMessages: [],
    queuedMessageCount: 0,
    subagentTranscriptCount: 0,
    resumeCommand: `codex resume ${sessionId}`,
    subagent: null
  }
}
