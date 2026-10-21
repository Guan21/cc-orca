import { ipcMain, type BrowserWindow, type IpcMainEvent, type WebContents } from 'electron'
import {
  verifyProjectSourceWindowDocument,
  type ProjectSourceWindowDocumentOptions
} from './project-source-window-document'

type Options = Readonly<{
  producer: { clear(): void }
  window: BrowserWindow
  expectedDocumentUrl: string
  currentAppProfile: ProjectSourceWindowDocumentOptions['currentAppProfile']
}>
type Owner = Readonly<{
  producer: Options['producer']
  origin: ProjectSourceWindowDocumentOptions
}>

const channel = 'devCrew:clearProjectSourceSelection'
const owners = new Map<WebContents, Owner>()
let responderInstalled = false

/** Reply even when Personal source selection is unavailable; never strand a sendSync caller. */
export function ensureProjectSourceSelectionRetirementResponder(): void {
  if (!responderInstalled) {
    ipcMain.on(channel, retire)
    responderInstalled = true
  }
}

function retire(event: IpcMainEvent, ...args: unknown[]): void {
  event.returnValue = false
  try {
    const owner = owners.get(event.sender)
    if (
      args.length !== 0 ||
      !owner ||
      !verifyProjectSourceWindowDocument(owner.origin, event.sender, event.senderFrame)
    ) {
      return
    }
    owner.producer.clear()
    event.returnValue = true
  } catch {
    // A synchronous caller must always receive a reply, including during teardown.
  }
}

/** Renderer can only retire scope; the native Main menu owns every positive selection. */
export function registerProjectSourceSelectionRetirement(options: Options): () => void {
  const contents = options.window.webContents
  if (owners.has(contents)) {
    throw new Error('Project source selection retirement owner already registered')
  }
  const owner: Owner = {
    producer: options.producer,
    origin: {
      approvedWindow: options.window,
      approvedSession: contents.session,
      expectedDocumentUrl: options.expectedDocumentUrl,
      currentAppProfile: options.currentAppProfile
    }
  }
  const cleanup = (): void => {
    if (owners.get(contents) !== owner) {
      return
    }
    owners.delete(contents)
    contents.removeListener('destroyed', cleanup)
  }
  ensureProjectSourceSelectionRetirementResponder()
  owners.set(contents, owner)
  contents.once('destroyed', cleanup)
  return cleanup
}
