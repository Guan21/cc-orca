import type { ProjectSourceOperationReply } from '../../shared/github/project-source-ipc-contract'

export type ProjectSourceApi = {
  /** Explicit intent only; Main performs independent registration consent. */
  registerSelected: () => Promise<ProjectSourceOperationReply>
  /** Main must independently pin PR/HEAD; renderer cannot supply a SHA or grant. */
  refreshSelected: () => Promise<ProjectSourceOperationReply>
}
