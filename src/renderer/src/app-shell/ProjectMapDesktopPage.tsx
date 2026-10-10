import ProjectMapPage from '../components/project-map/ProjectMapPage'
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

  // No authorized project-state source is wired yet; keep the source explicitly unavailable.
  return <ProjectMapPage key={scopeKey} projectId={project?.id} />
}
