/** G2-B5a — payload-free intent channels, not authorization or a live-source claim. */
export const PROJECT_SOURCE_REGISTER_CHANNEL = 'devCrew:registerSelectedProjectSource'
export const PROJECT_SOURCE_REFRESH_CHANNEL = 'devCrew:refreshSelectedProjectSource'

/** No factual GitHub data crosses IPC in B5a. B5b needs a new delivery review. */
export type ProjectSourceOperationReply = Readonly<{
  status: 'denied' | 'disabled' | 'unavailable' | 'busy' | 'stale' | 'registered' | 'refreshed'
}>
