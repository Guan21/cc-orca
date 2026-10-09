import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildAiVaultResumeCommand } from '../../shared/ai-vault-resume-command'
import {
  filterAiVaultSessions,
  type AiVaultSessionFilterState
} from '../../shared/ai-vault-session-filters'
import { readAiVaultFirstUserPrompt } from './session-first-user-prompt-read'
import { scanAiVaultSessions } from './session-scanner'
import { isolatedScanRoots, writeJsonlFile } from './session-scanner-test-fixtures'

let root: string
const denyNetwork = vi.fn((): never => {
  throw new Error('Local history attempted network communication')
})

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-corporate-local-history-'))
  vi.stubEnv('ORCA_BUILD_PROFILE', 'corporate')
  denyNetwork.mockClear()
  vi.stubGlobal('fetch', denyNetwork)
  vi.spyOn(http, 'request').mockImplementation(denyNetwork)
  vi.spyOn(http, 'get').mockImplementation(denyNetwork)
  vi.spyOn(https, 'request').mockImplementation(denyNetwork)
  vi.spyOn(https, 'get').mockImplementation(denyNetwork)
  vi.spyOn(net.Socket.prototype, 'connect').mockImplementation(denyNetwork)
})

afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  expect(denyNetwork).not.toHaveBeenCalled()
  const resolvedRoot = resolve(root)
  const temporaryRelativePath = relative(resolve(tmpdir()), resolvedRoot)
  if (
    !temporaryRelativePath ||
    temporaryRelativePath.startsWith('..') ||
    isAbsolute(temporaryRelativePath)
  ) {
    throw new Error('Refusing cleanup outside the temporary directory')
  }
  await rm(resolvedRoot, { recursive: true, force: true })
})

async function writeLocalHistory() {
  const roots = isolatedScanRoots(root)
  const claudeFile = join(roots.claudeProjectsDir, 'folder', 'claude-local.jsonl')
  const codexFile = join(roots.codexSessionsDir, 'codex-local.jsonl')
  await writeJsonlFile(claudeFile, [
    {
      type: 'user',
      sessionId: 'claude-local',
      cwd: '/projects/plain-folder',
      timestamp: '2026-10-01T10:00:00.000Z',
      message: { role: 'user', content: 'Find the invoice history' }
    }
  ])
  await writeJsonlFile(codexFile, [
    {
      type: 'session_meta',
      timestamp: '2026-10-01T11:00:00.000Z',
      payload: { id: 'codex-local', cwd: '/projects/git-repository' }
    },
    {
      type: 'event_msg',
      timestamp: '2026-10-01T11:00:01.000Z',
      payload: { type: 'user_message', message: 'Repair the payroll search' }
    }
  ])
  return { roots, claudeFile, codexFile }
}

const filters: AiVaultSessionFilterState = {
  query: '',
  agents: ['claude', 'codex'],
  scope: 'all',
  sort: 'updated',
  activeWorktreePaths: [],
  hideEmptySessions: true
}

describe('reused local session history under Corporate mode', () => {
  it.skipIf(process.platform !== 'win32')(
    'refuses configured external roots before discovery',
    async () => {
      await expect(
        scanAiVaultSessions({
          ...isolatedScanRoots(root),
          codexSessionsDir: '\\\\external-host\\share\\sessions'
        })
      ).rejects.toThrow('Network session paths are disabled')
      vi.stubEnv('CODEX_HOME', '\\\\external-host\\share\\codex')
      await expect(scanAiVaultSessions(isolatedScanRoots(root))).rejects.toThrow(
        'Network session paths are disabled'
      )
    }
  )

  it.each(['corporate', 'default'])(
    'discovers local Claude/Codex history in %s builds',
    async (profile) => {
      vi.stubEnv('ORCA_BUILD_PROFILE', profile)
      const { roots } = await writeLocalHistory()
      const result = await scanAiVaultSessions({ ...roots, platform: 'darwin' })

      expect(result.issues).toEqual([])
      expect(result.sessions.map((session) => session.sessionId)).toEqual([
        'codex-local',
        'claude-local'
      ])
      expect(result.sessions.every((session) => session.executionHostId === 'local')).toBe(true)
    }
  )

  it('searches local prompts and filters a plain folder workspace and project', async () => {
    const { roots } = await writeLocalHistory()
    const { sessions } = await scanAiVaultSessions({ ...roots, platform: 'darwin' })
    expect(filterAiVaultSessions(sessions, { ...filters, query: 'payroll' })).toEqual([sessions[0]])
    expect(
      filterAiVaultSessions(sessions, {
        ...filters,
        scope: 'workspace',
        activeWorktreePaths: ['/projects/plain-folder']
      }).map((session) => session.sessionId)
    ).toEqual(['claude-local'])
    const folderSession = sessions.find((session) => session.agent === 'claude')!
    expect(
      filterAiVaultSessions(sessions, {
        ...filters,
        scope: 'project',
        activeProjectKey: 'folder:plain-folder',
        sessionProjectById: new Map([
          [folderSession.id, { kind: 'folder', key: 'folder:plain-folder', label: 'Plain folder' }]
        ])
      })
    ).toEqual([folderSession])
    expect(filterAiVaultSessions(sessions, { ...filters, query: 'no matching prompt' })).toEqual([])
  })

  it('reads the first prompt and builds existing provider resume invocations without networking', async () => {
    const { roots, claudeFile, codexFile } = await writeLocalHistory()
    const { sessions } = await scanAiVaultSessions({ ...roots, platform: 'darwin' })
    await expect(
      readAiVaultFirstUserPrompt({ agent: 'claude', filePath: claudeFile })
    ).resolves.toEqual({ prompt: 'Find the invoice history' })
    await expect(
      readAiVaultFirstUserPrompt({ agent: 'codex', filePath: codexFile })
    ).resolves.toEqual({ prompt: 'Repair the payroll search' })
    for (const session of sessions) {
      const command = buildAiVaultResumeCommand({
        agent: session.agent,
        sessionId: session.sessionId,
        cwd: session.cwd,
        platform: 'darwin'
      })
      expect(command).toContain(session.cwd!)
      expect(command).toContain(session.sessionId)
      expect(command).toContain(session.agent === 'claude' ? 'claude --resume' : 'codex resume')
    }
  })

  it('returns empty history for absent roots and tolerates empty, corrupted and removed files', async () => {
    const roots = isolatedScanRoots(root)
    const empty = await scanAiVaultSessions({ ...roots, platform: 'darwin' })
    expect(empty.sessions).toEqual([])
    expect(empty.issues).toEqual([])
    const malformedFile = join(roots.claudeProjectsDir, 'folder', 'malformed.jsonl')
    await writeJsonlFile(malformedFile, [])
    await writeFile(malformedFile, '{broken json\n')
    const emptyFile = join(roots.codexSessionsDir, 'empty.jsonl')
    await writeJsonlFile(emptyFile, [])
    const corrupted = await scanAiVaultSessions({ ...roots, platform: 'darwin' })
    expect(corrupted.sessions).toHaveLength(2)
    expect(corrupted.sessions.every((session) => session.messageCount === 0)).toBe(true)
    expect(filterAiVaultSessions(corrupted.sessions, filters)).toEqual([])
    await expect(
      readAiVaultFirstUserPrompt({ agent: 'claude', filePath: malformedFile })
    ).resolves.toEqual({ prompt: null })
    await expect(
      readAiVaultFirstUserPrompt({ agent: 'codex', filePath: emptyFile })
    ).resolves.toEqual({ prompt: null })
    await rm(malformedFile)
    await expect(
      readAiVaultFirstUserPrompt({ agent: 'claude', filePath: malformedFile })
    ).resolves.toEqual({ prompt: null })
    const afterRemoval = await scanAiVaultSessions({ ...roots, platform: 'darwin' })
    expect(afterRemoval.sessions.map((session) => session.sessionId)).toEqual(['empty'])
    expect(filterAiVaultSessions(afterRemoval.sessions, filters)).toEqual([])
  })
})
