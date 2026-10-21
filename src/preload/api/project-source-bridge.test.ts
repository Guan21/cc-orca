import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PROJECT_SOURCE_REFRESH_CHANNEL,
  PROJECT_SOURCE_REGISTER_CHANNEL
} from '../../shared/github/project-source-ipc-contract'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(async () => ({ status: 'disabled' })),
  buildProfile: vi.fn(() => 'default')
}))
vi.mock('electron', () => ({
  ipcRenderer: { invoke: mocks.invoke }
}))
vi.mock('../../shared/corporate-build-profile', () => ({
  getOrcaBuildProfile: mocks.buildProfile
}))
import { projectSourceApi } from './project-source-bridge'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.buildProfile.mockReturnValue('default')
})

describe('G2-B5a project source preload intent', () => {
  it('passes no renderer-supplied identifiers, revision, SHA, token or query', async () => {
    await projectSourceApi.registerSelected()
    await projectSourceApi.refreshSelected()
    expect(mocks.invoke).toHaveBeenNthCalledWith(1, PROJECT_SOURCE_REGISTER_CHANNEL)
    expect(mocks.invoke).toHaveBeenNthCalledWith(2, PROJECT_SOURCE_REFRESH_CHANNEL)
  })

  it('does not even send an intent from a Corporate build', async () => {
    mocks.buildProfile.mockReturnValue('corporate')
    expect(await projectSourceApi.registerSelected()).toEqual({ status: 'disabled' })
    expect(await projectSourceApi.refreshSelected()).toEqual({ status: 'disabled' })
    expect(mocks.invoke).not.toHaveBeenCalled()
  })
})
