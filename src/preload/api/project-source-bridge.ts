import { ipcRenderer } from 'electron'
import {
  PROJECT_SOURCE_REFRESH_CHANNEL,
  PROJECT_SOURCE_REGISTER_CHANNEL
} from '../../shared/github/project-source-ipc-contract'
import type { ProjectSourceApi } from './project-source-api'

/** Renderer never supplies Project, Repository, PR, HEAD, token or revision values. */
export const projectSourceApi: ProjectSourceApi = {
  registerSelected: () => ipcRenderer.invoke(PROJECT_SOURCE_REGISTER_CHANNEL),
  refreshSelected: () => ipcRenderer.invoke(PROJECT_SOURCE_REFRESH_CHANNEL)
}
