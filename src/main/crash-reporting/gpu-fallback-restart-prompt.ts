import { dialog, type BrowserWindow, type MessageBoxOptions } from 'electron'
import { getProductDisplayName } from '../../shared/product-display-name'

export type GpuFallbackRestartDecision = 'restart' | 'continue'

function getGpuFallbackRestartOptions(): MessageBoxOptions {
  const productName = getProductDisplayName()
  const versionDescription = productName === 'Orca' ? 'this Orca version' : 'this app version'
  return {
    type: 'warning',
    buttons: ['Restart in Safe Graphics Mode', 'Keep Running'],
    defaultId: 0,
    cancelId: 1,
    title: `Restart ${productName} in Safe Graphics Mode?`,
    message: `${productName}'s graphics process has crashed repeatedly.`,
    detail: `Safe graphics mode disables hardware acceleration and WebGL for ${versionDescription}. Terminals and 3D content may render more slowly. Keep Running leaves graphics settings unchanged.`
  }
}

export async function promptForGpuFallbackRestart(
  parentWindow?: BrowserWindow
): Promise<GpuFallbackRestartDecision> {
  const { response } = parentWindow
    ? await dialog.showMessageBox(parentWindow, getGpuFallbackRestartOptions())
    : await dialog.showMessageBox(getGpuFallbackRestartOptions())
  return response === 0 ? 'restart' : 'continue'
}
