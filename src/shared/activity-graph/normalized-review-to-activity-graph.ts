import { z } from 'zod'
import { normalizeReviewResult } from '../review-result-normalization'
import type { NormalizedReviewResult } from '../review-result-types'
import type { ReviewSubjectIdentity } from '../review-queue-subject-identity'
import type { ActivityGraphUpdate } from './activity-graph'
import { ActivityGraphUpdateBuilder } from './activity-graph-update-builder'

export type ActivityGraphReviewContext = {
  projectId: string
  provider: string
  subject: ReviewSubjectIdentity
}

const identity = z.string().trim().min(1)
const reviewSchema = z.object({
  reviewId: identity,
  subjectId: identity,
  reviewer: z.object({
    id: identity,
    type: z.enum(['human', 'agent', 'system']),
    provider: identity.optional()
  }),
  verdict: z.enum(['pass', 'issue', 'uncertain']),
  reviewedAt: z
    .string()
    .refine((value) => /\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value))),
  evidenceRefs: z.array(identity),
  findings: z.array(
    z.object({
      findingId: identity,
      category: z.enum([
        'security',
        'correctness',
        'architecture',
        'requirement',
        'performance',
        'testing',
        'maintainability',
        'other'
      ]),
      severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      summary: z.string(),
      evidenceRefs: z.array(identity)
    })
  )
}) satisfies z.ZodType<NormalizedReviewResult>

export function projectNormalizedReviewResultToGraphUpdates(
  context: ActivityGraphReviewContext,
  raw: unknown
): ActivityGraphUpdate | undefined {
  const parsed = reviewSchema.safeParse(raw)
  if (
    !parsed.success ||
    !context.projectId.trim() ||
    !context.provider.trim() ||
    parsed.data.subjectId !== context.subject.key
  ) {
    return undefined
  }
  const subject = context.subject
  const expectedKey =
    subject.type === 'pull_request'
      ? `${context.projectId}:pull_request:${subject.provider}:${subject.id}`
      : undefined
  const changePrefix = `${context.projectId}:change:`
  if (
    subject.type === 'pull_request'
      ? subject.key !== expectedKey || subject.provider !== context.provider
      : ![`${changePrefix}task:${subject.id}`, `${changePrefix}session:${subject.id}`].includes(
          subject.key
        )
  ) {
    return undefined
  }
  const review = normalizeReviewResult(parsed.data)
  const sourceId = `normalized_review:${context.provider}:${subject.key}:${review.reviewId}`
  const b = new ActivityGraphUpdateBuilder(
    context.projectId,
    review.reviewedAt,
    sourceId,
    review.evidenceRefs
  )
  const project = b.node('project', [], { projectId: context.projectId })
  const reviewPackage = b.node('review_package', [context.provider, subject.key, review.reviewId], {
    reviewId: review.reviewId,
    provider: context.provider,
    status: 'completed',
    verdict: review.verdict,
    subjectId: review.subjectId
  })
  if (subject.type === 'pull_request') {
    const pr = b.node('pull_request', [context.provider, subject.id], {
      provider: context.provider,
      pullRequestId: subject.id
    })
    b.edge('BELONGS_TO', reviewPackage, pr)
    b.edge('BELONGS_TO', pr, project)
  } else if (subject.key === `${changePrefix}task:${subject.id}`) {
    const task = b.node('task', [subject.id], { taskId: subject.id })
    b.edge('PRODUCED', task, reviewPackage)
    b.edge('BELONGS_TO', task, project)
  } else {
    const run = b.node('run', [subject.id], { runId: subject.id })
    b.edge('PRODUCED', run, reviewPackage)
    b.edge('BELONGS_TO', run, project)
  }
  const reviewer = b.actor(review.reviewer)
  if (reviewer) {
    b.edge('REVIEWED_BY', reviewPackage, reviewer)
  }
  for (const finding of review.findings) {
    const node = b.node(
      'review_finding',
      [context.provider, subject.key, review.reviewId, finding.findingId],
      {
        findingId: finding.findingId,
        category: finding.category,
        ...(finding.severity ? { severity: finding.severity } : {})
      }
    )
    b.edge('HAS_FINDING', reviewPackage, node)
    for (const ref of finding.evidenceRefs) {
      b.attachEvidence(ref, 'review_reference', [node])
    }
  }
  for (const ref of review.evidenceRefs) {
    b.attachEvidence(ref, 'review_reference', [reviewPackage])
  }
  return b.update
}
