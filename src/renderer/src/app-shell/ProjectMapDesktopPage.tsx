import ProjectMapPage from '../components/project-map/ProjectMapPage'
import SelectedPrSourcePanel from '../components/project-map/SelectedPrSourcePanel'
import { useActiveRepo } from '../store/selectors'
import { useAppStore } from '../store'
import { getRepoExecutionHostId } from '../../../shared/execution-host'

export default function ProjectMapDesktopPage(): React.JSX.Element {
  const project = useActiveRepo()
  const workspaceHostId = useAppStore((state) => state.activeWorkspaceExecutionHostId)
  const scopeKey = JSON.stringify([
    workspaceHostId ?? (project ? getRepoExecutionHostId(project) : null),
    project?.id ?? null
  ])

  // B5b: render an explicit source-disabled evidence panel. The status-only B5a
  // IPC does not deliver facts, credentials, a Main-pinned scope or HEAD.
  // Never derive source truth from renderer's active repository/session.
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <SelectedPrSourcePanel state={{ status: 'disabled' }} />
      <div className="min-h-0 flex-1">
        <ProjectMapPage key={scopeKey} projectId={project?.id} />
      </div>
    </div>
  )
}
