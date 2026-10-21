import { describe, expect, it, vi } from 'vitest'
import type { SelectedGitHubPrProjection } from '../../shared/github/selected-pr-graphql-projection'
import {
  MainSelectedPrFactDeliveryFence,
  type MainPinnedSelectedPrHead,
  type MainSelectedPrFactPacket
} from './project-source-main-pr-evidence-delivery'

const HEAD = 'a'.repeat(40)
const OTHER_HEAD = 'b'.repeat(40)
const NOW = Date.parse('2026-10-21T12:01:00.000Z')
const head: MainPinnedSelectedPrHead = {
  document: {
    profile: 'personal-packaged',
    executionRealm: 'native',
    installationId: 'installation-1',
    windowId: 1,
    webContentsId: 2,
    frameProcessId: 4,
    frameRoutingId: 6,
    documentId: 'document-1',
    sessionPartition: 'persist:main',
    principalId: 'principal-1',
    credentialGeneration: 5
  },
  binding: {
    projectId: 'project-1',
    workspaceKind: 'worktree',
    workspaceId: 'worktree-1',
    hostSetupId: 'host-1',
    executionHostId: 'native-host-1',
    repository: {
      host: 'github.com',
      id: 1001,
      nodeId: 'R_1',
      owner: 'Team',
      name: 'service'
    },
    prNumber: 12
  },
  bindingRevision: 8,
  selectionRevision: 9,
  grantRevision: 12,
  sessionIncarnation: 'incarnation-1',
  headSha: HEAD,
  observedAtMs: NOW - 40_000
}

function ready(facts: unknown[] = [
  {
    kind: 'pull_request',
    number: 12,
    headSha: HEAD,
    state: 'open',
    updatedAt: '2026-10-21T11:59:00Z'
  },
  { kind: 'commit', sha: HEAD },
  { kind: 'check_run', id: 80, headSha: HEAD, status: 'in_progress', conclusion: null }
]): Extract<SelectedGitHubPrProjection, { status: 'ready' }> {
  return {
    status: 'ready',
    snapshot: {
      version: 1,
      projectId: 'project-1',
      bindingRevision: 8,
      repository: { host: 'github.com', id: 1001, owner: 'Team', name: 'service' },
      fetchedAt: '2026-10-21T12:00:00Z',
      facts
    } as Extract<SelectedGitHubPrProjection, { status: 'ready' }>['snapshot']
  }
}
function setup(
  patch: Partial<ConstructorParameters<typeof MainSelectedPrFactDeliveryFence>[0]> = {}
) {
  const readCurrent = vi.fn((): MainPinnedSelectedPrHead | null => head)
  const isAuthorizedNow = vi.fn(() => true)
  const isEnabled = vi.fn(() => true)
  const send = vi.fn((packet: MainSelectedPrFactPacket) => {
    void packet
  })
  const fence = new MainSelectedPrFactDeliveryFence({
    readCurrent,
    isAuthorizedNow,
    isEnabled,
    nowMs: () => NOW,
    send,
    ...patch
  })
  return { fence, readCurrent, isAuthorizedNow, isEnabled, send }
}

describe('#165 B5c Main-only selected-PR final fact delivery fence', () => {
  it('sends only normalized, selected G1 facts exactly once', () => {
    const fixture = setup()
    expect(fixture.fence.deliver(ready())).toBe(true)
    expect(fixture.send).toHaveBeenCalledOnce()
    expect(fixture.send.mock.calls[0][0]).toMatchObject({
      version: 1,
      projectId: 'project-1',
      prNumber: 12,
      headSha: HEAD,
      snapshot: {
        projectId: 'project-1',
        facts: [{ kind: 'check_run', id: 80, headSha: HEAD, status: 'in_progress', conclusion: null }]
      }
    })
    const packet = fixture.send.mock.calls[0][0]
    expect(JSON.stringify(packet)).not.toMatch(/token|rawResponse|accessToken|password/i)
    expect(fixture.fence.deliver(ready())).toBe(false)
    expect(fixture.send).toHaveBeenCalledOnce()
  })

  it('rejects by default when disabled; no Main credential or read call is reached', () => {
    const f = setup({ isEnabled: () => false })
    expect(f.fence.deliver(ready())).toBe(false)
    expect(f.readCurrent).not.toHaveBeenCalled()
    expect(f.send).not.toHaveBeenCalled()
  })

  it('refuses absent, stale and altered Main HEAD authority with no delivery', () => {
    for (const altered of [
      null,
      { ...head, headSha: 'bad' },
      { ...head, observedAtMs: NOW - 10 * 60_000 },
      { ...head, document: { ...head.document, profile: 'corporate' } },
      { ...head, document: { ...head.document, executionRealm: 'remote' } },
      { ...head, binding: { ...head.binding, workspaceKind: 'folder' } },
      { ...head, binding: { ...head.binding, repository: { ...head.binding.repository, host: 'gitlab.com' } } },
      { ...head, document: { ...head.document, documentId: '' } }
    ]) {
      const f = setup({ readCurrent: () => altered as MainPinnedSelectedPrHead | null })
      expect(f.fence.deliver(ready())).toBe(false)
      expect(f.send).not.toHaveBeenCalled()
    }
  })

  it('rejects scope, binding revision, PR, HEAD and cross-HEAD Check contamination', () => {
    const fact = ready().snapshot.facts
    const scenarios = [
      { ...ready(), snapshot: { ...ready().snapshot, projectId: 'other' } },
      { ...ready(), snapshot: { ...ready().snapshot, bindingRevision: 7 } },
      { ...ready(), snapshot: { ...ready().snapshot, repository: { ...ready().snapshot.repository, id: 1002 } } },
      ready([{ ...fact.find(x => x.kind === 'pull_request'), number: 99 }, ...fact.filter(x => x.kind !== 'pull_request')]),
      ready([{ ...fact.find(x => x.kind === 'pull_request'), headSha: OTHER_HEAD }, ...fact.filter(x => x.kind !== 'pull_request')]),
      ready(fact.map(x => x.kind === 'check_run' ? { ...x, headSha: OTHER_HEAD } : x))
    ]
    for (const projection of scenarios) {
      const f = setup()
      expect(f.fence.deliver(projection as ReturnType<typeof ready>)).toBe(false)
      expect(f.send).not.toHaveBeenCalled()
    }
  })

  it('rejects when current document, principal, selection or grant changes during projection', () => {
    const updated = [
      { ...head, document: { ...head.document, documentId: 'document-2' } },
      { ...head, document: { ...head.document, principalId: 'other' } },
      { ...head, document: { ...head.document, credentialGeneration: 6 } },
      { ...head, selectionRevision: 10 },
      { ...head, grantRevision: 13 },
      { ...head, sessionIncarnation: 'new' },
      { ...head, binding: { ...head.binding, workspaceId: 'worktree-2' } },
      { ...head, headSha: OTHER_HEAD }
    ]
    for (const altered of updated) {
      let reads = 0
      const f = setup({
        readCurrent: () => ++reads === 1 ? head : altered as MainPinnedSelectedPrHead
      })
      expect(f.fence.deliver(ready())).toBe(false)
      expect(f.send).not.toHaveBeenCalled()
    }
  })

  it('denies native authority revocation immediately before the synchronous send', () => {
    let permitted = true
    let count = 0
    const f = setup({
      isAuthorizedNow: () => {
        count += 1
        if (count >= 2) permitted = false
        return permitted
      }
    })
    expect(f.fence.deliver(ready())).toBe(false)
    expect(f.send).not.toHaveBeenCalled()
  })

  it('uses an early single-use permit against synchronous reentrant authority callbacks', () => {
    let target: MainSelectedPrFactDeliveryFence
    let nested: boolean | null = null
    const f = setup({
      readCurrent: () => {
        nested = target.deliver(ready())
        return head
      }
    })
    target = f.fence
    expect(f.fence.deliver(ready())).toBe(true)
    expect(nested).toBe(false)
    expect(f.send).toHaveBeenCalledOnce()
  })

  it('preserves unknown CI when checks are absent, never inventing all-green claims', () => {
    const facts = ready().snapshot.facts.filter(x => x.kind !== 'check_run')
    const f = setup()
    expect(f.fence.deliver(ready(facts))).toBe(true)
    expect(f.send.mock.calls[0][0].snapshot.facts.every((x: { kind: string }) => x.kind !== 'check_run')).toBe(true)
  })

  it('does not retry a failed Main synchronous send or expose thrown sink errors', () => {
    const sink = vi.fn(() => { throw new Error('secret') })
    const f = setup({ send: sink })
    expect(f.fence.deliver(ready())).toBe(false)
    expect(f.fence.deliver(ready())).toBe(false)
    expect(sink).toHaveBeenCalledOnce()
  })
})
