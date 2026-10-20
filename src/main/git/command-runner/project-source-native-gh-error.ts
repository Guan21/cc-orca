const SAFE_CODES = new Set([
  'DISABLED',
  'BUSY',
  'DEADLINE',
  'ABORTED',
  'INVALID_OPERATION',
  'INVALID_VARIABLES',
  'UNTRUSTED_RUNTIME',
  'AUTHORIZATION_REVOKED',
  'UNTRUSTED_CREDENTIAL',
  'UNTRUSTED_EXECUTABLE',
  'UNTRUSTED_ENVIRONMENT',
  'CONFINEMENT_NOT_VERIFIED',
  'TERMINATION_NOT_VERIFIED',
  'RESPONSE_TOO_LARGE',
  'PROCESS_FAILED',
  'HTTP_401',
  'HTTP_403',
  'HTTP_404',
  'HTTP_429',
  'OFFLINE'
])
export class ProjectSourceNativeGhError extends Error {
  readonly code: string
  constructor(untrustedCode: string) {
    const code = SAFE_CODES.has(untrustedCode) ? untrustedCode : 'PROCESS_FAILED'
    super(`Project source transport: ${code}`)
    this.code = code
    this.name = 'ProjectSourceNativeGhError'
  }
}

export function processFailureCode(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return 'PROCESS_FAILED'
  }
  const failure = error as { stderr?: unknown; message?: unknown }
  const stderr = typeof failure.stderr === 'string' ? failure.stderr.slice(0, 4096) : ''
  const message = typeof failure.message === 'string' ? failure.message.slice(0, 4096) : ''
  const status = /\bHTTP (401|403|404|429)\b/.exec(stderr)?.[1]
  if (status) {
    return `HTTP_${status}`
  }
  if (/\b(?:ENOTFOUND|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|offline)\b/i.test(stderr)) {
    return 'OFFLINE'
  }
  if (/produced more than \d+ bytes of output/.test(message)) {
    return 'RESPONSE_TOO_LARGE'
  }
  return 'PROCESS_FAILED'
}
