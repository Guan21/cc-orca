type Selection = Readonly<{
  activeRepoId: string | null
  activeWorktreeId: string | null
  activeWorkspaceExecutionHostId: string | null
}>

/** UI changes can revoke Main scope, but cannot establish or restore it. */
export function installProjectSourceSelectionRetirement<State extends Selection>(
  store: { subscribe(listener: (state: State, previous: State) => void): () => void },
  clear: () => void
): () => void {
  return store.subscribe((state, previous) => {
    if (
      state.activeRepoId !== previous.activeRepoId ||
      state.activeWorktreeId !== previous.activeWorktreeId ||
      state.activeWorkspaceExecutionHostId !== previous.activeWorkspaceExecutionHostId
    ) {
      clear()
    }
  })
}
