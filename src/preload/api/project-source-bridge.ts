import { ipcRenderer } from 'electron'
import { getOrcaBuildProfile } from '../../shared/corporate-build-profile'
import {
  PROJECT_SOURCE_REFRESH_CHANNEL,
  PROJECT_SOURCE_REGISTER_CHANNEL
} from '../../shared/github/project-source-ipc-contract'
import type { ProjectSourceApi } from './project-source-api'

/** Renderer never supplies Project, Repository, PR, HEAD, token or revision values. */
export const projectSourceApi: ProjectSourceApi = {
  registerSelected: () =>
    getOrcaBuildProfile() === 'corporate'
      ? Promise.resolve({ status: 'disabled' })
      : ipcRenderer.invoke(PROJECT_SOURCE_REGISTER_CHANNEL),
  refreshSelected: () =>
    getOrcaBuildProfile() === 'corporate'
      ? Promise.resolve({ status: 'disabled' })
      : ipcRenderer.invoke(PROJECT_SOURCE_REFRESH_CHANNEL)
}
