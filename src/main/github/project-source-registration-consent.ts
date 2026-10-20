import { app, BrowserWindow, dialog } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'

/** Separate Main-owned operation; Project selection and PR consent cannot authorize it. */
export async function confirmProjectSourceRegistration(
  event: IpcMainInvokeEvent,
  projectId: string,
  repository: Readonly<{ host: 'github.com'; owner: string; name: string }>,
  isCurrent: () => boolean
): Promise<boolean> {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!app.isPackaged || !window || window.isDestroyed() || !isCurrent()) {
    return false
  }
  const result = await dialog.showMessageBox(window, {
    type: 'question',
    title: 'DevCrew — GitHub repository registration',
    message: 'Allow a one-time repository identity verification?',
    detail: [
      `Project: ${projectId}`,
      `Repository: ${repository.owner}/${repository.name}`,
      'This checks the immutable GitHub repository identity.',
      'PR reads require a separate confirmation. No background access is allowed.'
    ].join('\n'),
    buttons: ['Cancel', 'Verify repository'],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  })
  return result.response === 1 && app.isPackaged && !window.isDestroyed() && isCurrent()
}
