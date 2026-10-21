import { ipcMain } from 'electron'
import type { BrowserWindow, IpcMainInvokeEvent, WebContents } from 'electron'
import {
  PROJECT_SOURCE_REFRESH_CHANNEL,
  PROJECT_SOURCE_REGISTER_CHANNEL,
  type ProjectSourceOperationReply
} from '../../shared/github/project-source-ipc-contract'
import {
  verifyProjectSourceWindowDocument,
  type ProjectSourceWindowDocumentOptions
} from './project-source-window-document'

type Status = ProjectSourceOperationReply['status']
type Operation = 'register' | 'refresh'
type Options = Readonly<{
  window: BrowserWindow
  expectedDocumentUrl: string
  currentAppProfile: ProjectSourceWindowDocumentOptions['currentAppProfile']
  /** May become true only after separately reviewed live credential/confinement acceptance. */
  isEnabled: () => boolean
  /** Main-only B4c Coordinator. The callback must preserve independent native consent. */
  register: (event: IpcMainInvokeEvent) => Promise<Status>
  /** No production refresh callback until Main-pinned HEAD and final delivery are reviewed. */
  refresh?: (event: IpcMainInvokeEvent) => Promise<Status>
}>
type Owner = {
  options: Options
  origin: ProjectSourceWindowDocumentOptions
  generation: number
  pending: boolean
  retired: boolean
}
const owners = new Map<WebContents, Owner>()
let handlersInstalled = false

function verified(owner: Owner, event: IpcMainInvokeEvent): boolean {
  return (
    !owner.retired &&
    owners.get(event.sender) === owner &&
    verifyProjectSourceWindowDocument(owner.origin, event.sender, event.senderFrame)
  )
}

async function handle(
  operation: Operation,
  event: IpcMainInvokeEvent,
  args: unknown[]
): Promise<ProjectSourceOperationReply> {
  const owner = owners.get(event.sender)
  if (!owner || args.length !== 0 || !verified(owner, event)) {
    return { status: 'denied' }
  }
  if (owner.pending) {
    return { status: 'busy' }
  }
  try {
    if (!owner.options.isEnabled()) {
      return { status: 'disabled' }
    }
  } catch {
    return { status: 'unavailable' }
  }
  const operationCallback =
    operation === 'register' ? owner.options.register : owner.options.refresh
  if (!operationCallback) {
    return { status: 'unavailable' }
  }
  const generation = owner.generation
  owner.pending = true
  try {
    const status = await operationCallback(event)
    if (generation !== owner.generation || !verified(owner, event)) {
      return { status: 'stale' }
    }
    // B5a does not carry data, errors, GraphQL responses or arbitrary callback objects.
    const accepted: readonly Status[] =
      operation === 'register'
        ? ['registered', 'denied', 'unavailable', 'stale']
        : ['refreshed', 'denied', 'unavailable', 'stale']
    return { status: accepted.includes(status) ? status : 'unavailable' }
  } catch {
    return { status: 'unavailable' }
  } finally {
    owner.pending = false
  }
}

/** One permanent deny-if-unowned responder; re-created macOS windows only replace owners. */
export function ensureProjectSourceOperationResponders(): void {
  if (handlersInstalled) {
    return
  }
  ipcMain.handle(PROJECT_SOURCE_REGISTER_CHANNEL, (event, ...args: unknown[]) =>
    handle('register', event, args)
  )
  ipcMain.handle(PROJECT_SOURCE_REFRESH_CHANNEL, (event, ...args: unknown[]) =>
    handle('refresh', event, args)
  )
  handlersInstalled = true
}

/** Called only by the approved Main window Bootstrap, never from Renderer. */
export function registerProjectSourceOperationOwner(options: Options): () => void {
  ensureProjectSourceOperationResponders()
  const contents = options.window.webContents
  if (owners.has(contents)) {
    throw new Error('Project source IPC owner already registered')
  }
  const owner: Owner = {
    options,
    origin: {
      approvedWindow: options.window,
      approvedSession: contents.session,
      expectedDocumentUrl: options.expectedDocumentUrl,
      currentAppProfile: options.currentAppProfile
    },
    generation: 0,
    pending: false,
    retired: false
  }
  const invalidate = (): void => {
    owner.generation += 1
  }
  const dispose = (): void => {
    if (owner.retired) {
      return
    }
    owner.retired = true
    invalidate()
    if (owners.get(contents) === owner) {
      owners.delete(contents)
    }
    options.window.removeListener('closed', dispose)
    for (const name of [
      'destroyed',
      'did-start-navigation',
      'will-navigate',
      'did-navigate',
      'render-process-gone'
    ] as const) {
      contents.removeListener(name, name === 'destroyed' ? dispose : invalidate)
    }
  }
  owners.set(contents, owner)
  try {
    options.window.on('closed', dispose)
    for (const name of [
      'destroyed',
      'did-start-navigation',
      'will-navigate',
      'did-navigate',
      'render-process-gone'
    ] as const) {
      contents.on(name, name === 'destroyed' ? dispose : invalidate)
    }
  } catch {
    dispose()
    throw new Error('Project source IPC lifecycle unavailable')
  }
  return dispose
}
