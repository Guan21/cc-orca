/**
 * #152 B3 — Main-internal composition for a packaged Personal selected PR.
 * Still UNWIRED: it registers no IPC handler, credential reader or network call.
 *
 * NEVER pass binding directly from renderer. The caller must verify it against
 * Main-owned Project/Workspace and a trusted immutable GitHub repo registration.
 */
import { BrowserWindow } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import {
  MainSelectedPrGrantRegistry,
  type TrustedSelectedPrBinding,
  type VerifiedSourceDocument
} from './project-source-grant-registry'
import {
  PersonalProjectSourceElectronOrigin,
  type ElectronSourceOriginOptions
} from './project-source-electron-origin'
import { createPersonalPrConsent } from './project-source-personal-consent'

function sameDocument(a: VerifiedSourceDocument, b: VerifiedSourceDocument): boolean {
  return (
    a.profile === b.profile &&
    a.executionRealm === b.executionRealm &&
    a.installationId === b.installationId &&
    a.windowId === b.windowId &&
    a.webContentsId === b.webContentsId &&
    a.frameProcessId === b.frameProcessId &&
    a.frameRoutingId === b.frameRoutingId &&
    a.documentId === b.documentId &&
    a.sessionPartition === b.sessionPartition &&
    a.principalId === b.principalId &&
    a.credentialGeneration === b.credentialGeneration
  )
}

export class MainPersonalProjectSourceAuthority {
  private readonly perWebContents = new Map<number, MainSelectedPrGrantRegistry>()
  private readonly origin: PersonalProjectSourceElectronOrigin

  constructor(options: Omit<ElectronSourceOriginOptions, 'revokeWebContents'>) {
    this.origin = new PersonalProjectSourceElectronOrigin({
      ...options,
      revokeWebContents: (id) => this.retireWebContents(id)
    })
  }

  private retireWebContents(id: number): void {
    this.perWebContents.get(id)?.retireWebContents(id)
    this.perWebContents.delete(id)
  }

  /** Called ONLY after Main independently authenticates the chosen binding. */
  selectTrusted(event: IpcMainInvokeEvent, binding: TrustedSelectedPrBinding): boolean {
    const document = this.origin.attest(event)
    const id = event.sender.id
    this.retireWebContents(id)
    if (!document) {
      return false
    }
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window || window.isDestroyed() || window.webContents !== event.sender) {
      return false
    }
    const registry = new MainSelectedPrGrantRegistry(
      createPersonalPrConsent(window, () => {
        const latest = this.origin.attest(event)
        return latest !== null && sameDocument(latest, document)
      })
    )
    if (!registry.select(document, binding)) {
      return false
    }
    this.perWebContents.set(id, registry)
    return true
  }

  /** Requires an explicit user gesture in the future Main IPC entry point. */
  async requestConsent(event: IpcMainInvokeEvent): Promise<boolean> {
    const registry = this.perWebContents.get(event.sender.id)
    if (!registry) {
      return false
    }
    return registry.requestGrant(() => this.origin.attest(event))
  }

  /** Main-level Project switch/logout/credential revocation; never renderer auth. */
  revoke(event: IpcMainInvokeEvent): void {
    this.retireWebContents(event.sender.id)
  }

  retireAll(): void {
    for (const id of this.perWebContents.keys()) {
      this.retireWebContents(id)
    }
  }
}
