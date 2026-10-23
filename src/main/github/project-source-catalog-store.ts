import type { Store } from '../persistence'

export type CatalogStore = Pick<
  Store,
  'getProjects' | 'getProjectHostSetups' | 'getRepos' | 'subscribeMutations'
> &
  Partial<
    Pick<
      Store,
      | 'getUnambiguousWorktreeMetaForHost'
      | 'getAllWorktreeMetaForHost'
      | 'subscribeBeforeMutations'
      | 'isMutationInProgress'
    >
  > & {
    getSettings?: () => Pick<ReturnType<Store['getSettings']>, 'localWindowsRuntimeDefault'>
  }
