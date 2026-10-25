/** Synthetic only. GitHub PR/HEAD/check metadata is produced by the GitHub server. */
export function describeStatus(value) {
  if (value === 'ready') return 'Ready for observation'
  return 'Unknown'
}
