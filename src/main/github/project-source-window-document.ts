import { app, BrowserWindow } from 'electron'
import type { Session, WebContents, WebFrameMain } from 'electron'

export type ProjectSourceWindowDocumentOptions = Readonly<{
  approvedWindow?: BrowserWindow
  approvedSession: Session
  currentAppProfile: () => 'personal' | 'corporate' | 'development'
  expectedDocumentUrl: string
}>

function nonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/** Verifies Main-pinned document identity only; never attests a principal or grant. */
export function verifyProjectSourceWindowDocument(
  options: ProjectSourceWindowDocumentOptions,
  sender: WebContents | null | undefined,
  frame: WebFrameMain | null | undefined
): boolean {
  try {
    const expected = options.expectedDocumentUrl
    if (
      !app.isPackaged ||
      options.currentAppProfile() !== 'personal' ||
      typeof expected !== 'string' ||
      expected.length === 0 ||
      expected.length > 256 ||
      expected.trim() !== expected ||
      [...expected].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) ||
      !sender ||
      sender.isDestroyed() ||
      sender.isLoadingMainFrame() ||
      sender.session !== options.approvedSession ||
      !frame ||
      frame !== sender.mainFrame ||
      frame.isDestroyed() ||
      !nonnegative(frame.processId) ||
      !nonnegative(frame.routingId) ||
      frame.url.split('#')[0] !== expected.split('#')[0]
    ) {
      return false
    }
    const window = BrowserWindow.fromWebContents(sender)
    return !!(
      window &&
      (options.approvedWindow === undefined || window === options.approvedWindow) &&
      !window.isDestroyed() &&
      window.webContents === sender &&
      nonnegative(window.id) &&
      nonnegative(sender.id)
    )
  } catch {
    return false
  }
}
