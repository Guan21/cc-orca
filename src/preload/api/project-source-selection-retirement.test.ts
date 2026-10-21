import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ sendSync: vi.fn() }))
vi.mock('electron', () => ({ ipcRenderer: { sendSync: mocks.sendSync } }))
import { uiStateAndMenuCommandsApi } from './ui-bridge-state-and-menu-commands'

beforeEach(() => mocks.sendSync.mockReset())

describe('desktop project source retirement bridge', () => {
  it('forwards no renderer scope or authorization data and waits for Main acknowledgement', () => {
    mocks.sendSync.mockReturnValue(true)
    expect(uiStateAndMenuCommandsApi.clearProjectSourceSelection()).toBe(true)
    expect(mocks.sendSync).toHaveBeenCalledExactlyOnceWith('devCrew:clearProjectSourceSelection')
  })

  it.each([false, undefined, 'true', {}])(
    'fails closed on non-true acknowledgement %s',
    (reply) => {
      mocks.sendSync.mockReturnValue(reply)
      expect(uiStateAndMenuCommandsApi.clearProjectSourceSelection()).toBe(false)
    }
  )
})
