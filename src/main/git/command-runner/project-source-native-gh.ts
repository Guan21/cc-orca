import { ProjectSourceNativeGhError, processFailureCode } from './project-source-native-gh-error'
export { ProjectSourceNativeGhError } from './project-source-native-gh-error'
import { createHash } from 'node:crypto'
import { readFile, realpath, stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { execFileCaptureToTermination } from './exec-file-capture'

import type {
  NativeGhCredentialAttestation,
  ProjectSourceNativeGhOptions,
  ProjectSourceNativeGhRunner
} from './project-source-native-gh-contract'
export type {
  NativeGhExecutableIdentity,
  NativeGhCredentialAttestation,
  ProjectSourceNativeGhOptions,
  ProjectSourceNativeGhRequest,
  ProjectSourceNativeGhRunner
} from './project-source-native-gh-contract'
const MAX_RESPONSE_BYTES = 1024 * 1024
const MAX_DEADLINE_MS = 15_000
// Main owns one permit across runner factories, including uncertain child termination.
const executionLane = { owner: null as symbol | null, idle: Promise.resolve() }
const ENVIRONMENT_KEYS = new Set([
  'HOME',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'SystemRoot',
  'TEMP',
  'TMP'
])
function hasControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => character.charCodeAt(0) < 32)
}
function fail(code: string): never {
  throw new ProjectSourceNativeGhError(code)
}
function nativeMagic(bytes: Buffer): boolean {
  const magic = bytes.subarray(0, 4).toString('hex')
  return (
    magic.startsWith('4d5a') ||
    ['7f454c46', 'feedface', 'feedfacf', 'cefaedfe', 'cffaedfe', 'cafebabe', 'bebafeca'].includes(
      magic
    )
  )
}
/** Main-only composition point; no production credential/confinement provisioner is installed. */
export function createProjectSourceNativeGhRunner(
  options: ProjectSourceNativeGhOptions
): ProjectSourceNativeGhRunner {
  const executable = Object.freeze({ ...options.executable })
  const fixedQueries = Object.freeze({ ...options.fixedQueries })
  const environment = Object.freeze({ ...options.environment })
  const expectedPrincipalId = options.expectedPrincipalId
  const expectedCredentialGeneration = options.expectedCredentialGeneration
  const runtimeReader = options.runtime
  const credentialReader = options.readCredentialAttestation
  const authorizationCheck = options.assertAuthorized
  const confinementCheck = options.confinement?.assertConfined
  const enabled = options.enabled === true
  return {
    whenIdle: () => executionLane.idle,
    async execute(request) {
      if (!enabled) {
        fail('DISABLED')
      }
      if (executionLane.owner !== null) {
        fail('BUSY')
      }
      const deadlineMs = request.deadlineMs
      const signal = request.signal
      if (!Number.isFinite(deadlineMs) || deadlineMs <= Date.now()) {
        fail('DEADLINE')
      }
      if (signal?.aborted) {
        fail('ABORTED')
      }
      const query = fixedQueries[request.operation]
      if (typeof query !== 'string' || !/^\s*query\b/.test(query) || /\bmutation\b/.test(query)) {
        fail('INVALID_OPERATION')
      }
      if (
        !request.variables ||
        Object.entries(request.variables).some(
          ([key, value]) =>
            !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key) ||
            (typeof value !== 'string' &&
              !(typeof value === 'number' && Number.isSafeInteger(value))) ||
            (typeof value === 'string' && (value.length > 512 || hasControlCharacters(value)))
        )
      ) {
        fail('INVALID_VARIABLES')
      }
      const input = JSON.stringify({ query, variables: { ...request.variables } })
      if (Buffer.byteLength(input) > 64 * 1024) {
        fail('INVALID_OPERATION')
      }
      // Request access may reenter another factory before this acquisition.
      if (executionLane.owner !== null) {
        fail('BUSY')
      }
      const reservation = Symbol()
      executionLane.owner = reservation
      const idle = Promise.withResolvers<void>()
      executionLane.idle = idle.promise
      const controller = new AbortController()
      const endAt = Math.min(deadlineMs, Date.now() + MAX_DEADLINE_MS)
      let timedOut = false
      const onAbort = (): void => controller.abort()
      signal?.addEventListener('abort', onAbort, { once: true })
      const timer = setTimeout(() => {
        timedOut = true
        controller.abort()
      }, endAt - Date.now())
      let initialCredential: string | undefined
      const check = (): NativeGhCredentialAttestation => {
        if (timedOut || Date.now() >= endAt) {
          fail('DEADLINE')
        }
        if (controller.signal.aborted) {
          fail('ABORTED')
        }
        let runtime: ReturnType<ProjectSourceNativeGhOptions['runtime']>
        try {
          runtime = runtimeReader()
        } catch {
          fail('UNTRUSTED_RUNTIME')
        }
        if (!runtime.packaged || runtime.profile !== 'personal' || runtime.execution !== 'native') {
          fail('UNTRUSTED_RUNTIME')
        }
        try {
          authorizationCheck()
        } catch {
          fail('AUTHORIZATION_REVOKED')
        }
        let credential: NativeGhCredentialAttestation | null
        try {
          credential = credentialReader()
        } catch {
          fail('UNTRUSTED_CREDENTIAL')
        }
        if (
          !credential ||
          credential.host !== 'github.com' ||
          credential.source !== 'os-keyring' ||
          credential.principalId !== expectedPrincipalId ||
          credential.credentialGeneration !== expectedCredentialGeneration ||
          !credential.identityFingerprint ||
          !credential.policyReviewReceipt ||
          !isAbsolute(credential.configDir) ||
          /^(?:\\\\|\/\/)/.test(credential.configDir)
        ) {
          fail('UNTRUSTED_CREDENTIAL')
        }
        const snapshot = JSON.stringify(credential)
        if (initialCredential !== undefined && snapshot !== initialCredential) {
          fail('UNTRUSTED_CREDENTIAL')
        }
        initialCredential = snapshot
        return { ...credential }
      }
      const verifyExecutable = async (): Promise<void> => {
        if (
          !isAbsolute(executable.path) ||
          executable.path !== executable.realPath ||
          /^(?:\\\\|\/\/)/.test(executable.path) ||
          /\.(?:cmd|bat|ps1|sh)$/i.test(executable.path) ||
          !/^[a-f0-9]{64}$/.test(executable.sha256) ||
          executable.size < 4 ||
          executable.size > 128 * 1024 * 1024
        ) {
          fail('UNTRUSTED_EXECUTABLE')
        }
        const resolved = await realpath(executable.path)
        check()
        if (resolved !== executable.realPath) {
          fail('UNTRUSTED_EXECUTABLE')
        }
        const metadata = await stat(executable.path)
        check()
        if (
          !metadata.isFile() ||
          (['dev', 'ino', 'size', 'mtimeMs'] as const).some(
            (key) => metadata[key] !== executable[key]
          )
        ) {
          fail('UNTRUSTED_EXECUTABLE')
        }
        const bytes = await readFile(executable.path, { signal: controller.signal })
        check()
        if (
          !nativeMagic(bytes) ||
          createHash('sha256').update(bytes).digest('hex') !== executable.sha256
        ) {
          fail('UNTRUSTED_EXECUTABLE')
        }
      }
      let launched = false
      let terminationVerified = false
      let confirmTermination!: () => void
      const terminated = new Promise<void>((resolve) => {
        confirmTermination = resolve
      })
      const work = async (): Promise<string> => {
        const credential = check()
        if (
          Object.entries(environment).some(
            ([key, value]) =>
              !ENVIRONMENT_KEYS.has(key) || typeof value !== 'string' || hasControlCharacters(value)
          )
        ) {
          fail('UNTRUSTED_ENVIRONMENT')
        }
        const env = Object.freeze({
          ...environment,
          GH_CONFIG_DIR: credential.configDir,
          GH_PROMPT_DISABLED: '1',
          GH_NO_UPDATE_NOTIFIER: '1',
          GH_NO_EXTENSION_UPDATE_NOTIFIER: '1',
          GIT_TERMINAL_PROMPT: '0'
        })
        if (!confinementCheck) {
          fail('CONFINEMENT_NOT_VERIFIED')
        }
        confinementCheck({ executable, environment: env, credential })
        check()
        await verifyExecutable()
        check()
        confinementCheck({ executable, environment: env, credential: check() })
        check()
        launched = true
        const response = await execFileCaptureToTermination(
          executable.path,
          ['api', 'graphql', '--hostname', 'github.com', '--input', '-'],
          {
            encoding: 'utf8',
            stdin: input,
            cwd: credential.configDir,
            env,
            maxBuffer: MAX_RESPONSE_BYTES,
            timeout: Math.max(1, endAt - Date.now()),
            signal: controller.signal,
            createTimeoutError: () => new ProjectSourceNativeGhError('DEADLINE'),
            onChildTerminated: () => {
              terminationVerified = true
              confirmTermination()
            }
          }
        )
        check()
        if (!terminationVerified) {
          fail('TERMINATION_NOT_VERIFIED')
        }
        await verifyExecutable()
        check()
        if (
          typeof response.stdout !== 'string' ||
          Buffer.byteLength(response.stdout) > MAX_RESPONSE_BYTES
        ) {
          fail('RESPONSE_TOO_LARGE')
        }
        return response.stdout
      }
      let abortListener: (() => void) | undefined
      const abort = new Promise<never>((_resolve, reject) => {
        abortListener = () =>
          reject(new ProjectSourceNativeGhError(timedOut ? 'DEADLINE' : 'ABORTED'))
        controller.signal.addEventListener('abort', abortListener, { once: true })
      })
      const pending = work()
      // Settlement can precede termination proof; uncertainty permanently holds the lane.
      const release = async (): Promise<void> => {
        if (launched) {
          await terminated
        }
        if (executionLane.owner === reservation) {
          executionLane.owner = null
        }
        idle.resolve()
      }
      void pending.then(release, release)
      try {
        const result = await Promise.race([pending, abort])
        check()
        return result
      } catch (error) {
        if (error instanceof ProjectSourceNativeGhError) {
          throw new ProjectSourceNativeGhError(error.code)
        }
        check()
        fail(processFailureCode(error))
      } finally {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        if (abortListener) {
          controller.signal.removeEventListener('abort', abortListener)
        }
      }
    }
  }
}
