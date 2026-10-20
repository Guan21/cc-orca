/**
 * #152 B3 — Main-owned, packaged-Personal confirmation only.
 * The returned callback may be supplied to a per-window grant registry.
 * Calling this is NOT permission to run an API request or grant an IPC method.
 */
import { app } from 'electron'
import type { BrowserWindow } from 'electron'
import type { TrustedSelectedPrBinding } from './project-source-grant-registry'
import { confirmProjectSourceNative } from './project-source-native-confirmation'

/**
 * getCurrentApproval is a trusted Main-origin predicate (not renderer state).
 * The grant registry must also revalidate its document/revision after await.
 */
export function createPersonalPrConsent(
  window: BrowserWindow,
  getCurrentApproval: () => boolean,
  signal?: AbortSignal
): (binding: TrustedSelectedPrBinding) => Promise<boolean> {
  return async (binding): Promise<boolean> => {
    if (
      !app.isPackaged ||
      window.isDestroyed() ||
      window.webContents.isDestroyed() ||
      !getCurrentApproval() ||
      binding.repository.host !== 'github.com'
    ) {
      return false
    }
    const accepted = await confirmProjectSourceNative(
      window,
      {
        type: 'question',
        title: 'DevCrew — GitHub project read',
        message: 'Allow a one-time, read-only GitHub PR refresh?',
        detail: [
          `Project: ${binding.projectId}`,
          `Repository: ${binding.repository.owner}/${binding.repository.name}`,
          `Pull request: #${binding.prNumber}`,
          'Only this selected PR, head commit and CI checks will be requested.',
          'This confirmation does not allow background polling or write actions.'
        ].join('\n'),
        buttons: ['Cancel', 'Allow read'],
        defaultId: 0,
        cancelId: 0,
        noLink: true
      },
      signal
    )
    return (
      accepted &&
      app.isPackaged &&
      !window.isDestroyed() &&
      !window.webContents.isDestroyed() &&
      getCurrentApproval()
    )
  }
}
