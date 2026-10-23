import type { NativeGhCredentialAttestation } from '../git/command-runner/project-source-native-gh'

export type MainNativePrincipalEvidence = NativeGhCredentialAttestation & {
  credentialGeneration: number
  loginVerified: true
}

function bounded(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 512 &&
    value.trim() === value &&
    ![...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  )
}

/** No credential reader is installed here. Evidence must come from reviewed Main code. */
export class MainNativeGitHubPrincipal {
  private pinned: Readonly<MainNativePrincipalEvidence> | null = null
  private retired = false
  private verifying = false

  constructor(
    private readonly verify?: () => unknown,
    private readonly retireAuthorities: () => void = () => {}
  ) {}

  revoke(): void {
    if (!this.retired) {
      this.retired = true
      this.pinned = null
      this.retireAuthorities()
    }
  }

  /** Changes permanently retire this monitor; a new session requires new consent. */
  current(): Readonly<MainNativePrincipalEvidence> | null {
    if (this.retired || !this.verify) {
      return null
    }
    if (this.verifying) {
      return this.reject()
    }
    this.verifying = true
    try {
      const raw = this.verify()
      if (this.retired || typeof raw !== 'object' || raw === null) {
        return this.reject()
      }
      const source = raw as Partial<MainNativePrincipalEvidence>
      const candidate = {
        host: source.host,
        source: source.source,
        loginVerified: source.loginVerified,
        credentialGeneration: source.credentialGeneration,
        principalId: source.principalId,
        configDir: source.configDir,
        identityFingerprint: source.identityFingerprint,
        policyReviewReceipt: source.policyReviewReceipt
      }
      if (
        this.retired ||
        candidate.host !== 'github.com' ||
        candidate.source !== 'os-keyring' ||
        candidate.loginVerified !== true ||
        !Number.isSafeInteger(candidate.credentialGeneration) ||
        typeof candidate.credentialGeneration !== 'number' ||
        candidate.credentialGeneration < 0 ||
        !bounded(candidate.principalId) ||
        !bounded(candidate.configDir) ||
        !bounded(candidate.identityFingerprint) ||
        !bounded(candidate.policyReviewReceipt)
      ) {
        return this.reject()
      }
      const evidence: Readonly<MainNativePrincipalEvidence> = Object.freeze({
        host: 'github.com',
        principalId: candidate.principalId,
        credentialGeneration: candidate.credentialGeneration,
        source: 'os-keyring',
        configDir: candidate.configDir,
        identityFingerprint: candidate.identityFingerprint,
        policyReviewReceipt: candidate.policyReviewReceipt,
        loginVerified: true
      })
      if (this.pinned && JSON.stringify(this.pinned) !== JSON.stringify(evidence)) {
        return this.reject()
      }
      this.pinned = evidence
      return evidence
    } catch {
      return this.reject()
    } finally {
      this.verifying = false
    }
  }

  private reject(): null {
    this.revoke()
    return null
  }
}
