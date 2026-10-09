import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { getTrustedUIRendererWebContents } from './ui'
import { assertSkillOperationAllowed } from '../../shared/corporate-skills-policy'

export function handleMainWindowSkillIpc<Args extends unknown[], Result>(
  channel: string,
  listener: (event: IpcMainInvokeEvent, ...args: Args) => Result
): void {
  ipcMain.handle(channel, (event, ...args) => {
    if (getTrustedUIRendererWebContents() !== event.sender) {
      throw new Error('Unauthorized skill IPC sender')
    }
    assertSkillOperationAllowed(channel.replace(/^skills:/, ''))
    return listener(event, ...(args as Args))
  })
}
