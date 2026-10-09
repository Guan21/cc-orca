import type { ActivityGraphEdgeType, ActivityGraphNodeType } from './activity-graph'

export function activityGraphNodeId(
  projectId: string,
  type: ActivityGraphNodeType,
  ...identityParts: string[]
): string {
  return ['project', projectId, type, ...identityParts].map(encodeURIComponent).join(':')
}

export function activityGraphEdgeId(
  projectId: string,
  type: ActivityGraphEdgeType,
  from: string,
  to: string
): string {
  return ['edge', projectId, type, from, to].map(encodeURIComponent).join(':')
}

export function normalizeActivityGraphPath(raw: string): string | undefined {
  const path = raw.replaceAll('\\', '/')
  if (path.startsWith('/') || /^[a-z]:/i.test(path)) {
    return undefined
  }
  const parts: string[] = []
  for (const part of path.split('/')) {
    if (!part || part === '.') {
      continue
    }
    if (part === '..') {
      if (!parts.length) {
        return undefined
      }
      parts.pop()
    } else {
      parts.push(part)
    }
  }
  return parts.length ? parts.join('/') : undefined
}
