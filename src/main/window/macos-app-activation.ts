import type { BrowserWindow } from 'electron'
import { deferAppKitSceneMutation } from '../appkit-scene-mutation'
import { safelyRevealWindow } from './focus-existing-window'

export function createMacAppActivationHandler(options: {
  getWindow: () => BrowserWindow | null
  requestActivation: () => void
}): () => void {
  return () => {
    const window = options.getWindow()
    if (!window || window.isDestroyed()) {
      options.requestActivation()
      return
    }
    const isVisible = typeof window.isVisible === 'function' ? window.isVisible() : true
    const isMinimized = typeof window.isMinimized === 'function' ? window.isMinimized() : false
    // Why: re-focusing an existing visible macOS window can race its scene-backed Space transition.
    if (isVisible && !isMinimized) {
      return
    }
    deferAppKitSceneMutation(() => safelyRevealWindow(window))
  }
}
