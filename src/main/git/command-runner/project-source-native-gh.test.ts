import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  createProjectSourceNativeGhRunner as CreateRunner,
  ProjectSourceNativeGhError as NativeGhError
} from './project-source-native-gh'
let createProjectSourceNativeGhRunner: typeof CreateRunner
let ProjectSourceNativeGhError: typeof NativeGhError

const mocks = vi.hoisted(() => ({
  realpath: vi.fn(),
  stat: vi.fn(),
  readFile: vi.fn(),
  execute: vi.fn()
}))
vi.mock('node:fs/promises', () => ({
  realpath: mocks.realpath,
  stat: mocks.stat,
  readFile: mocks.readFile
}))
vi.mock('./exec-file-capture', () => ({ execFileCaptureToTermination: mocks.execute }))

const binary = Buffer.from([0x4d, 0x5a, 0, 1])
const path = resolve('verified-gh.exe')
const executable = {
  path,
  realPath: path,
  sha256: createHash('sha256').update(binary).digest('hex'),
  dev: 1,
  ino: 2,
  size: 4,
  mtimeMs: 10
}
const credential = {
  host: 'github.com' as const,
  principalId: 'U_1',
  credentialGeneration: 1,
  source: 'os-keyring' as const,
  configDir: resolve('verified-config'),
  identityFingerprint: 'fingerprint',
  policyReviewReceipt: 'review-151'
}
function options() {
  return {
    enabled: true,
    executable,
    runtime: () => ({ packaged: true, profile: 'personal' as const, execution: 'native' as const }),
    environment: {},
    fixedQueries: {
      repositoryRegistration: 'query Register { viewer { id } }',
      selectedPrRead: 'query Read { viewer { id } }'
    },
    expectedPrincipalId: 'U_1',
    expectedCredentialGeneration: 1,
    readCredentialAttestation: () => credential,
    confinement: { assertConfined: vi.fn() },
    assertAuthorized: vi.fn()
  }
}
const request = () => ({
  operation: 'selectedPrRead' as const,
  variables: { owner: 'alice', number: 1 },
  deadlineMs: Date.now() + 5_000
})
beforeEach(async () => {
  // Unknown termination deliberately holds the production lane for its module lifetime.
  vi.resetModules()
  ;({ createProjectSourceNativeGhRunner, ProjectSourceNativeGhError } =
    await import('./project-source-native-gh'))
  vi.resetAllMocks()
  mocks.realpath.mockResolvedValue(path)
  mocks.stat.mockResolvedValue({ ...executable, isFile: () => true })
  mocks.readFile.mockResolvedValue(binary)
  mocks.execute.mockImplementation(async (_program, _args, options) => {
    options.onChildTerminated()
    return { stdout: '{"data":{}}', stderr: '' }
  })
})
describe('native project source gh runner', () => {
  it('sanitizes unrecognized exported error codes', () => {
    const error = new ProjectSourceNativeGhError('secret-token-sensitive-stderr')
    expect(error).toMatchObject({
      code: 'PROCESS_FAILED',
      message: 'Project source transport: PROCESS_FAILED'
    })
    expect(JSON.stringify(error)).not.toContain('secret-token')
  })
  it('defaults disabled with zero process calls', async () => {
    await expect(
      createProjectSourceNativeGhRunner({ ...options(), enabled: undefined }).execute(request())
    ).rejects.toMatchObject({ code: 'DISABLED' })
    expect(mocks.execute).not.toHaveBeenCalled()
  })
  it('pins native executable, fixed host/query, bounded stdin process and isolated environment', async () => {
    await expect(createProjectSourceNativeGhRunner(options()).execute(request())).resolves.toBe(
      '{"data":{}}'
    )
    expect(mocks.execute).toHaveBeenCalledOnce()
    const [program, args, config] = mocks.execute.mock.calls[0]
    expect(program).toBe(path)
    expect(args).toEqual(['api', 'graphql', '--hostname', 'github.com', '--input', '-'])
    expect(JSON.parse(config.stdin)).toEqual({
      query: options().fixedQueries.selectedPrRead,
      variables: request().variables
    })
    expect(config.maxBuffer).toBe(1024 * 1024)
    expect(config.cwd).toBe(credential.configDir)
    expect(config.timeout).toBeLessThanOrEqual(5_000)
    expect(config.env).toEqual({
      GH_CONFIG_DIR: credential.configDir,
      GH_PROMPT_DISABLED: '1',
      GH_NO_UPDATE_NOTIFIER: '1',
      GH_NO_EXTENSION_UPDATE_NOTIFIER: '1',
      GIT_TERMINAL_PROMPT: '0'
    })
  })
  it.each(['wsl', 'ssh', 'remote'])('rejects %s runtimes', async (execution) => {
    const config = options()
    await expect(
      createProjectSourceNativeGhRunner({
        ...config,
        runtime: () => ({ packaged: true, profile: 'personal', execution })
      }).execute(request())
    ).rejects.toMatchObject({ code: 'UNTRUSTED_RUNTIME' })
    expect(mocks.execute).not.toHaveBeenCalled()
  })
  it.each([
    { packaged: false, profile: 'personal', execution: 'native' },
    { packaged: true, profile: 'corporate', execution: 'native' },
    { packaged: true, profile: 'development', execution: 'native' }
  ])('rejects prohibited runtime %j', async (runtime) => {
    await expect(
      createProjectSourceNativeGhRunner({ ...options(), runtime: () => runtime }).execute(request())
    ).rejects.toMatchObject({ code: 'UNTRUSTED_RUNTIME' })
  })
  it.each([
    'GH_TOKEN',
    'GITHUB_TOKEN',
    'GH_HOST',
    'GH_CONFIG_DIR',
    'HTTPS_PROXY',
    'PATH',
    'NODE_OPTIONS'
  ])('rejects environment injection %s', async (key) => {
    await expect(
      createProjectSourceNativeGhRunner({ ...options(), environment: { [key]: 'secret' } }).execute(
        request()
      )
    ).rejects.toMatchObject({ code: 'UNTRUSTED_ENVIRONMENT' })
    expect(mocks.execute).not.toHaveBeenCalled()
  })
  it('requires separately proven network confinement', async () => {
    await expect(
      createProjectSourceNativeGhRunner({ ...options(), confinement: undefined }).execute(request())
    ).rejects.toMatchObject({ code: 'CONFINEMENT_NOT_VERIFIED' })
  })
  it.each([
    { principalId: 'U_other' },
    { credentialGeneration: 2 },
    { source: 'environment' },
    { host: 'evil.test' }
  ])('rejects mismatching credential %j', async (change) => {
    await expect(
      createProjectSourceNativeGhRunner({
        ...options(),
        readCredentialAttestation: () => ({ ...credential, ...change })
      }).execute(request())
    ).rejects.toMatchObject({ code: 'UNTRUSTED_CREDENTIAL' })
  })
  it('rejects non-native binaries and replacement before spawn', async () => {
    mocks.readFile.mockResolvedValue(Buffer.from('#!/bin/sh'))
    await expect(
      createProjectSourceNativeGhRunner(options()).execute(request())
    ).rejects.toMatchObject({ code: 'UNTRUSTED_EXECUTABLE' })
    expect(mocks.execute).not.toHaveBeenCalled()
  })
  it('rejects replacement after process returns', async () => {
    mocks.realpath.mockResolvedValueOnce(path).mockResolvedValue(resolve('replacement'))
    await expect(
      createProjectSourceNativeGhRunner(options()).execute(request())
    ).rejects.toMatchObject({ code: 'UNTRUSTED_EXECUTABLE' })
  })
  it('rechecks revocation after asynchronous verification', async () => {
    let authorized = true
    mocks.realpath.mockImplementation(async () => {
      authorized = false
      return path
    })
    await expect(
      createProjectSourceNativeGhRunner({
        ...options(),
        assertAuthorized: () => {
          if (!authorized) {
            throw new Error('revoked secret')
          }
        }
      }).execute(request())
    ).rejects.toMatchObject({
      code: 'AUTHORIZATION_REVOKED',
      message: 'Project source transport: AUTHORIZATION_REVOKED'
    })
    expect(mocks.execute).not.toHaveBeenCalled()
  })
  it('rejects concurrent execution without queueing', async () => {
    let finish!: (value: { stdout: string; stderr: string }) => void
    mocks.execute.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const runner = createProjectSourceNativeGhRunner(options())
    const first = runner.execute(request())
    await vi.waitFor(() => expect(mocks.execute).toHaveBeenCalledOnce())
    await expect(runner.execute(request())).rejects.toMatchObject({ code: 'BUSY' })
    mocks.execute.mock.calls[0][2].onChildTerminated()
    finish({ stdout: '{}', stderr: '' })
    await first
  })
  it.each(['deadlineMs', 'variables'] as const)(
    'blocks a second acquisition after reentrant request %s access',
    async (field) => {
      const firstRunner = createProjectSourceNativeGhRunner(options())
      const secondRunner = createProjectSourceNativeGhRunner(options())
      const outerRequest = request()
      const value = outerRequest[field]
      let nested: Promise<string> | undefined
      Object.defineProperty(outerRequest, field, {
        get() {
          nested ??= secondRunner.execute(request())
          return value
        }
      })
      const outer = firstRunner.execute(outerRequest).catch((error: unknown) => error)
      await nested
      await expect(outer).resolves.toMatchObject({ code: 'BUSY' })
      await secondRunner.whenIdle()
      expect(mocks.execute).toHaveBeenCalledOnce()
    }
  )
  it('publishes pending idle proof before runtime callbacks can inspect another runner', async () => {
    const pending = Promise.withResolvers<{ stdout: string; stderr: string }>()
    mocks.execute.mockReturnValue(pending.promise)
    const observer = createProjectSourceNativeGhRunner(options())
    let idleObserved = false
    const config = options()
    config.assertAuthorized.mockImplementationOnce(() => {
      void observer.whenIdle().then(() => {
        idleObserved = true
      })
    })
    const runner = createProjectSourceNativeGhRunner(config)
    const result = runner.execute(request())
    await vi.waitFor(() => expect(mocks.execute).toHaveBeenCalledOnce())
    expect(idleObserved).toBe(false)
    expect(observer.whenIdle()).toBe(runner.whenIdle())
    mocks.execute.mock.calls[0][2].onChildTerminated()
    pending.resolve({ stdout: '{}', stderr: '' })
    await result
    await observer.whenIdle()
    expect(idleObserved).toBe(true)
  })
  it('retains uncertain termination proof after rejecting a reentrant outer acquisition', async () => {
    mocks.execute.mockResolvedValue({ stdout: '{}', stderr: '' })
    const innerRunner = createProjectSourceNativeGhRunner(options())
    const outerRequest = request()
    let nested: Promise<unknown> | undefined
    Object.defineProperty(outerRequest, 'variables', {
      get() {
        nested ??= innerRunner.execute(request()).catch((error: unknown) => error)
        return { owner: 'alice', number: 1 }
      }
    })
    await expect(
      createProjectSourceNativeGhRunner(options()).execute(outerRequest)
    ).rejects.toMatchObject({ code: 'BUSY' })
    expect(await nested).toMatchObject({ code: 'TERMINATION_NOT_VERIFIED' })
    const replacement = createProjectSourceNativeGhRunner(options())
    await expect(replacement.execute(request())).rejects.toMatchObject({ code: 'BUSY' })
    expect(replacement.whenIdle()).toBe(innerRunner.whenIdle())
    let idle = false
    void replacement.whenIdle().then(() => {
      idle = true
    })
    await Promise.resolve()
    expect(idle).toBe(false)
    expect(mocks.execute).toHaveBeenCalledOnce()
  })
  it.each([
    ['HTTP 401 secret', 'HTTP_401'],
    ['HTTP 403 secret', 'HTTP_403'],
    ['HTTP 404 secret', 'HTTP_404'],
    ['HTTP 429 secret', 'HTTP_429'],
    ['offline token=secret', 'OFFLINE']
  ])('sanitizes %s and never retries', async (stderr, code) => {
    mocks.execute.mockRejectedValue(Object.assign(new Error(stderr), { stderr, stdout: 'secret' }))
    const error = await createProjectSourceNativeGhRunner(options())
      .execute(request())
      .catch((error: unknown) => error)
    expect(JSON.stringify(error)).not.toContain('secret')
    expect(String(error)).not.toContain('secret')
    expect(error).toMatchObject({ code })
    expect(mocks.execute).toHaveBeenCalledOnce()
  })
  it('rejects expired and aborted requests before process', async () => {
    const runner = createProjectSourceNativeGhRunner(options())
    await expect(
      runner.execute({ ...request(), deadlineMs: Date.now() - 1 })
    ).rejects.toMatchObject({ code: 'DEADLINE' })
    await expect(
      runner.execute({ ...request(), signal: AbortSignal.abort() })
    ).rejects.toMatchObject({ code: 'ABORTED' })
    expect(mocks.execute).not.toHaveBeenCalled()
  })
  it('rejects oversized responses even with a broken process adapter', async () => {
    mocks.execute.mockImplementation(async (_program, _args, options) => {
      options.onChildTerminated()
      return { stdout: 'x'.repeat(1024 * 1024 + 1), stderr: '' }
    })
    await expect(
      createProjectSourceNativeGhRunner(options()).execute(request())
    ).rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE' })
  })
  it('cancels in-flight execution and retains concurrency slot until process termination', async () => {
    let finish!: (value: { stdout: string; stderr: string }) => void
    mocks.execute.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const controller = new AbortController()
    const runner = createProjectSourceNativeGhRunner(options())
    const pending = runner.execute({ ...request(), signal: controller.signal })
    await vi.waitFor(() => expect(mocks.execute).toHaveBeenCalledOnce())
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'ABORTED' })
    expect(mocks.execute.mock.calls[0][2].signal.aborted).toBe(true)
    await expect(runner.execute(request())).rejects.toMatchObject({ code: 'BUSY' })
    await expect(
      createProjectSourceNativeGhRunner(options()).execute(request())
    ).rejects.toMatchObject({ code: 'BUSY' })
    let idle = false
    void runner.whenIdle().then(() => {
      idle = true
    })
    await Promise.resolve()
    expect(idle).toBe(false)
    mocks.execute.mock.calls[0][2].onChildTerminated()
    finish({ stdout: '{}', stderr: '' })
    await runner.whenIdle()
    expect(idle).toBe(true)
  })
  it('bounds the entire operation when binary verification stalls', async () => {
    mocks.realpath.mockImplementation(() => new Promise(() => {}))
    await expect(
      createProjectSourceNativeGhRunner(options()).execute({
        ...request(),
        deadlineMs: Date.now() + 20
      })
    ).rejects.toMatchObject({ code: 'DEADLINE' })
    expect(mocks.execute).not.toHaveBeenCalled()
  })
  it('detects credential generation changes after an await', async () => {
    let generation = 1
    mocks.realpath.mockImplementation(async () => {
      generation = 2
      return path
    })
    await expect(
      createProjectSourceNativeGhRunner({
        ...options(),
        readCredentialAttestation: () => ({ ...credential, credentialGeneration: generation })
      }).execute(request())
    ).rejects.toMatchObject({ code: 'UNTRUSTED_CREDENTIAL' })
    expect(mocks.execute).not.toHaveBeenCalled()
  })
  it('rejects runtime operation injection and never starts a process', async () => {
    await expect(
      createProjectSourceNativeGhRunner(options()).execute({
        ...request(),
        operation: 'arbitrary' as 'selectedPrRead'
      })
    ).rejects.toMatchObject({ code: 'INVALID_OPERATION' })
    expect(mocks.execute).not.toHaveBeenCalled()
  })
  it('rechecks authorization after confinement validator', async () => {
    let authorized = true
    const config = options()
    config.confinement.assertConfined.mockImplementation(() => {
      authorized = false
    })
    config.assertAuthorized.mockImplementation(() => {
      if (!authorized) {
        throw new Error('secret')
      }
    })
    await expect(
      createProjectSourceNativeGhRunner(config).execute(request())
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_REVOKED' })
    expect(mocks.execute).not.toHaveBeenCalled()
  })
  it('caps timeout at fifteen seconds', async () => {
    await createProjectSourceNativeGhRunner(options()).execute({
      ...request(),
      deadlineMs: Date.now() + 60_000
    })
    expect(mocks.execute.mock.calls[0][2].timeout).toBeLessThanOrEqual(15_000)
  })
  it('keeps lane blocked when adapter settles without termination evidence', async () => {
    mocks.execute.mockResolvedValue({ stdout: '{}', stderr: '' })
    const runner = createProjectSourceNativeGhRunner(options())
    await expect(runner.execute(request())).rejects.toMatchObject({
      code: 'TERMINATION_NOT_VERIFIED'
    })
    await expect(runner.execute(request())).rejects.toMatchObject({ code: 'BUSY' })
    let idle = false
    void runner.whenIdle().then(() => {
      idle = true
    })
    await Promise.resolve()
    expect(idle).toBe(false)
    expect(mocks.execute).toHaveBeenCalledOnce()
  })
  it('shares the process permit and idle proof across distinct runner instances', async () => {
    let finish!: (value: { stdout: string; stderr: string }) => void
    mocks.execute.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const firstRunner = createProjectSourceNativeGhRunner(options())
    const secondRunner = createProjectSourceNativeGhRunner(options())
    const pending = firstRunner.execute(request())
    await vi.waitFor(() => expect(mocks.execute).toHaveBeenCalledOnce())
    expect(secondRunner.whenIdle()).toBe(firstRunner.whenIdle())
    const competing = secondRunner.execute(request()).catch((error: unknown) => error)
    mocks.execute.mock.calls[0][2].onChildTerminated()
    finish({ stdout: '{}', stderr: '' })
    await pending
    await expect(competing).resolves.toMatchObject({ code: 'BUSY' })
    await secondRunner.whenIdle()
    mocks.execute.mockImplementation(async (_program, _args, config) => {
      config.onChildTerminated()
      return { stdout: '{}', stderr: '' }
    })
    await expect(secondRunner.execute(request())).resolves.toBe('{}')
  })
  it('cannot regain an uncertain process permit by constructing a new runner', async () => {
    mocks.execute.mockResolvedValue({ stdout: '{}', stderr: '' })
    const firstRunner = createProjectSourceNativeGhRunner(options())
    await expect(firstRunner.execute(request())).rejects.toMatchObject({
      code: 'TERMINATION_NOT_VERIFIED'
    })
    const newRunner = createProjectSourceNativeGhRunner(options())
    await expect(newRunner.execute(request())).rejects.toMatchObject({ code: 'BUSY' })
    let idle = false
    void newRunner.whenIdle().then(() => {
      idle = true
    })
    await Promise.resolve()
    expect(idle).toBe(false)
    expect(mocks.execute).toHaveBeenCalledOnce()
  })
})
