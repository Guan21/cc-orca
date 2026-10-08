import { getProductDisplayName } from '../../shared/product-display-name'

export function getCliCommandUsageDetail(commandPath: string): string {
  const productName = getProductDisplayName()
  if (productName === 'Orca') {
    return `Register ${commandPath} to use Orca from Command Prompt or PowerShell.`
  }
  return `Register ${commandPath} to use the ${productName} CLI from Command Prompt or PowerShell. The command name is retained for compatibility.`
}

export function getCliCommandTerminalUsageDetail(commandPath: string): string {
  return `Register ${commandPath} to use the ${getProductDisplayName()} CLI from the terminal. The command name is retained for compatibility.`
}

export function getWindowsLauncherPathUnknownDetail(): string {
  const productName = getProductDisplayName()
  return productName === 'Orca'
    ? 'The Orca launcher exists, but Orca could not check your Windows user PATH.'
    : `The ${productName} launcher exists, but ${productName} could not check your Windows user PATH.`
}
