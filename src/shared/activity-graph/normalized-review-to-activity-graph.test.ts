import { expect, it } from 'vitest'
import { projectNormalizedReviewResultToGraphUpdates } from './normalized-review-to-activity-graph'
import { applyActivityGraphUpdate, createActivityGraph } from './activity-graph-reducer'

const context = {
  projectId: 'p',
  provider: 'gitlab',
  subject: {
    key: 'p:pull_request:gitlab:12',
    type: 'pull_request' as const,
    id: '12',
    provider: 'gitlab'
  }
}
const review = {
  reviewId: 'review-1',
  subjectId: context.subject.key,
  reviewer: { type: 'agent', id: 'r', provider: 'future' },
  verdict: 'issue',
  reviewedAt: '2026-10-08T00:00:00Z',
  evidenceRefs: ['e1'],
  findings: [
    {
      findingId: 'f1',
      category: 'security',
      severity: 'high',
      summary: 'secret prompt',
      evidenceRefs: ['e2']
    }
  ]
}

it('reuses normalized review identities and finding semantics without copying free-form text', () => {
  const update = projectNormalizedReviewResultToGraphUpdates(context, review)!
  const graph = applyActivityGraphUpdate(createActivityGraph(), update)
  expect(applyActivityGraphUpdate(graph, update)).toEqual(graph)
  expect(graph.nodes.find((node) => node.type === 'review_finding')?.metadata).toMatchObject({
    findingId: 'f1',
    category: 'security',
    severity: 'high'
  })
  expect(graph.edges.map((edge) => edge.type)).toEqual(
    expect.arrayContaining(['HAS_FINDING', 'REVIEWED_BY', 'EVIDENCED_BY'])
  )
  expect(JSON.stringify(graph)).not.toContain('secret prompt')
  expect(
    graph.nodes.filter((node) => node.type === 'evidence').map((node) => node.metadata.evidenceId)
  ).toEqual(expect.arrayContaining(['e1', 'e2']))
})

it('rejects malformed reviews, mismatched subjects and invalid project context', () => {
  expect(
    projectNormalizedReviewResultToGraphUpdates(context, { ...review, subjectId: 'other' })
  ).toBeUndefined()
  expect(
    projectNormalizedReviewResultToGraphUpdates(context, { ...review, verdict: 'fabricated' })
  ).toBeUndefined()
  expect(
    projectNormalizedReviewResultToGraphUpdates({ ...context, projectId: '' }, review)
  ).toBeUndefined()
})

it('isolates reviews and finding IDs reused on different review subjects', () => {
  const second = {
    ...context,
    subject: { ...context.subject, id: '13', key: 'p:pull_request:gitlab:13' }
  }
  const firstUpdate = projectNormalizedReviewResultToGraphUpdates(context, review)!
  const secondUpdate = projectNormalizedReviewResultToGraphUpdates(second, {
    ...review,
    subjectId: second.subject.key
  })!
  const graph = applyActivityGraphUpdate(
    applyActivityGraphUpdate(createActivityGraph(), firstUpdate),
    secondUpdate
  )
  expect(graph.nodes.filter((node) => node.type === 'review_package')).toHaveLength(2)
  expect(graph.nodes.filter((node) => node.type === 'review_finding')).toHaveLength(2)
})
