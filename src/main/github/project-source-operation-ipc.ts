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

function current(owner: Owner, event: IpcMainInvokeEvent, generation: number): boolean {
  return !owner.retired && owners.get(event.sender) === owner && owner.generation === generation
}

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
  if (!owner || args.length !== 0) {
    return { status: 'denied' }
  }
  if (owner.pending) {
    return { status: 'busy' }
  }
  // Document and readiness providers may synchronously reenter or retire this owner.
  const generation = owner.generation
  owner.pending = true
  try {
    if (!verified(owner, event)) {
      return { status: 'denied' }
    }
    if (!current(owner, event, generation)) {
      return { status: 'stale' }
    }
    const enabled = owner.options.isEnabled()
    if (!current(owner, event, generation)) {
      return { status: 'stale' }
    }
    if (!enabled) {
      return { status: 'disabled' }
    }
    if (!verified(owner, event) || !current(owner, event, generation)) {
      return { status: 'stale' }
    }
    const operationCallback =
      operation === 'register' ? owner.options.register : owner.options.refresh
    if (!operationCallback) {
      return { status: 'unavailable' }
    }
    const status = await operationCallback(event)
    if (
      !current(owner, event, generation) ||
      !owner.options.isEnabled() ||
      !verified(owner, event) ||
      !current(owner, event, generation)
    ) {
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
    contents.removeListener('destroyed', dispose)
    contents.removeListener('did-start-navigation', invalidate)
    contents.removeListener('will-navigate', invalidate)
    contents.removeListener('did-navigate', invalidate)
    contents.removeListener('render-process-gone', invalidate)
  }
  owners.set(contents, owner)
  try {
    options.window.on('closed', dispose)
    contents.on('destroyed', dispose)
    contents.on('did-start-navigation', invalidate)
    contents.on('will-navigate', invalidate)
    contents.on('did-navigate', invalidate)
    contents.on('render-process-gone', invalidate)
  } catch {
    dispose()
    throw new Error('Project source IPC lifecycle unavailable')
  }
  return dispose
}
