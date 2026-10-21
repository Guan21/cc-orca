import { createStore } from 'zustand/vanilla'
import { describe, expect, it, vi } from 'vitest'
import { installProjectSourceSelectionRetirement } from './project-source-selection-retirement'

function fixture() {
  const store = createStore(() => ({
    activeRepoId: 'A',
    activeWorktreeId: 'worktree-A',
    activeWorkspaceExecutionHostId: 'local',
    unrelated: 0
  }))
  const clear = vi.fn()
  const cleanup = installProjectSourceSelectionRetirement(store, clear)
  return { store, clear, cleanup }
}

describe('renderer selection changes only retire Main selection', () => {
  it.each(['activeRepoId', 'activeWorktreeId', 'activeWorkspaceExecutionHostId'] as const)(
    'synchronously clears on %s changes, including A to B to A',
    (key) => {
      const f = fixture()
      const previous = f.store.getState()[key]
      expect(f.clear).not.toHaveBeenCalled()
      f.store.setState({ [key]: 'B' })
      expect(f.clear).toHaveBeenCalledExactlyOnceWith()
      f.store.setState({ [key]: previous })
      expect(f.clear).toHaveBeenCalledTimes(2)
    }
  )

  it('does not react to unrelated state or identical selection, and cleans up', () => {
    const f = fixture()
    f.store.setState({ unrelated: 1 })
    f.store.setState({ activeRepoId: 'A' })
    expect(f.clear).not.toHaveBeenCalled()
    f.cleanup()
    f.store.setState({ activeRepoId: 'B' })
    expect(f.clear).not.toHaveBeenCalled()
  })

  it('coalesces one atomic scope replacement into one no-argument retirement', () => {
    const f = fixture()
    f.store.setState({ activeRepoId: 'B', activeWorktreeId: 'worktree-B' })
    expect(f.clear).toHaveBeenCalledExactlyOnceWith()
  })
})
