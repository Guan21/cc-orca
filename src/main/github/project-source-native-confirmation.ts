import { dialog } from 'electron'
import type { BrowserWindow, MessageBoxOptions } from 'electron'

/** Abort closes the parented native dialog and settles even before its promise resolves. */
export function confirmProjectSourceNative(
  window: BrowserWindow,
  options: MessageBoxOptions,
  signal?: AbortSignal
): Promise<boolean> {
  if (signal?.aborted) {
    return Promise.resolve(false)
  }
  return new Promise((resolve) => {
    const finish = (accepted: boolean): void => {
      signal?.removeEventListener('abort', abort)
      resolve(accepted && !signal?.aborted)
    }
    const abort = (): void => finish(false)
    signal?.addEventListener('abort', abort, { once: true })
    try {
      void dialog.showMessageBox(window, { ...options, signal }).then(
        (result) => finish(result.response === 1),
        () => finish(false)
      )
    } catch {
      finish(false)
    }
  })
}
