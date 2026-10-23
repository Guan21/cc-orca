import { MainNativeGitHubPrincipal } from './project-source-native-principal'
import type { MainNativePrincipalEvidence } from './project-source-native-principal'

/** A reviewed Main adapter must supply cached attestations and synchronous invalidation. */
export type MainCredentialEvidenceAdapter = {
  readEvidence(): unknown
  subscribeChanges(listener: () => void): () => void
}

export type MainCredentialVerificationStatus = Readonly<{
  login: 'VERIFIED' | 'NOT VERIFIED'
  repositoryPermission: 'NOT VERIFIED'
  checksPermission: 'NOT VERIFIED'
  liveSource: 'LIVE_SOURCE_BLOCKED'
}>

/** No production OS/keyring adapter is installed; login never proves API permissions. */
export class MainCredentialEvidenceProvider {
  readonly principal: MainNativeGitHubPrincipal
  private retired = false
  private unsubscribe: (() => void) | null = null
  private readonly listeners = new Set<() => void>()

  constructor(
    options: {
      adapter?: MainCredentialEvidenceAdapter
      onRevoke?: () => void
    } = {}
  ) {
    if (options.onRevoke) {
      this.listeners.add(options.onRevoke)
    }
    const adapter = options.adapter
    this.principal = new MainNativeGitHubPrincipal(
      adapter ? () => adapter.readEvidence() : undefined,
      () => this.retire()
    )
    if (adapter) {
      try {
        const unsubscribe = adapter.subscribeChanges(() => this.revoke())
        if (typeof unsubscribe !== 'function') {
          this.revoke()
        } else if (this.retired) {
          this.notify(unsubscribe)
        } else {
          this.unsubscribe = unsubscribe
        }
      } catch {
        this.revoke()
      }
    }
  }

  current(): Readonly<MainNativePrincipalEvidence> | null {
    return this.principal.current()
  }

  status(): MainCredentialVerificationStatus {
    return Object.freeze({
      login: this.current() ? 'VERIFIED' : 'NOT VERIFIED',
      repositoryPermission: 'NOT VERIFIED',
      checksPermission: 'NOT VERIFIED',
      liveSource: 'LIVE_SOURCE_BLOCKED'
    })
  }

  subscribeRevocation(listener: () => void): () => void {
    if (this.retired) {
      this.notify(listener)
      return () => {}
    }
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  revoke(): void {
    this.principal.revoke()
  }

  dispose(): void {
    this.revoke()
  }

  private retire(): void {
    if (this.retired) {
      return
    }
    this.retired = true
    const unsubscribe = this.unsubscribe
    this.unsubscribe = null
    const listeners = [...this.listeners]
    this.listeners.clear()
    for (const listener of listeners) {
      this.notify(listener)
    }
    if (unsubscribe) {
      this.notify(unsubscribe)
    }
  }

  private notify(listener: () => void): void {
    try {
      listener()
    } catch {
      // Listener failures cannot prevent remaining authorities from being revoked.
    }
  }
}
