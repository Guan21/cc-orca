export type NativeGhExecutableIdentity = {
  path: string
  realPath: string
  sha256: string
  dev: number
  ino: number
  size: number
  mtimeMs: number
}
export type NativeGhCredentialAttestation = {
  host: string
  principalId: string
  credentialGeneration: string | number
  source: string
  configDir: string
  identityFingerprint: string
  policyReviewReceipt: string
}
export type ProjectSourceNativeGhOptions = {
  enabled?: boolean
  executable: NativeGhExecutableIdentity
  runtime(): { packaged: boolean; profile: string; execution: string }
  environment: Record<string, string>
  fixedQueries: { repositoryRegistration: string; selectedPrRead: string }
  expectedPrincipalId: string
  expectedCredentialGeneration: string | number
  readCredentialAttestation(): NativeGhCredentialAttestation | null
  confinement?: {
    assertConfined(snapshot: {
      executable: NativeGhExecutableIdentity
      environment: NodeJS.ProcessEnv
      credential: NativeGhCredentialAttestation
    }): void
  }
  assertAuthorized(): void
}
export type ProjectSourceNativeGhRequest = {
  operation: 'repositoryRegistration' | 'selectedPrRead'
  variables: Record<string, string | number>
  deadlineMs: number
  signal?: AbortSignal
}
export type ProjectSourceNativeGhRunner = {
  execute(request: ProjectSourceNativeGhRequest): Promise<string>
  whenIdle(): Promise<void>
}
