import { detectDisagreements } from '../../../../shared/disagreement-signal'
import type { DisagreementSignal } from '../../../../shared/disagreement-signal-types'
import type { NormalizedReviewResult } from '../../../../shared/review-result-types'

export function createReviewQueueDemoDisagreementSignals(): DisagreementSignal[] {
  return detectDisagreements(demoReviewResults(), {
    detectedAt: '2026-09-30T15:42:00.000Z'
  })
}

function demoReviewResults(): NormalizedReviewResult[] {
  const subjectId = 'project-devcrew-control-plane:pull_request:github:96'

  return [
    {
      reviewId: 'review-claude-96',
      subjectId,
      reviewer: {
        id: 'claude',
        type: 'agent',
        provider: 'claude'
      },
      verdict: 'pass',
      findings: [],
      reviewedAt: '2026-09-30T15:41:00.000Z',
      evidenceRefs: ['review:claude:96']
    },
    {
      reviewId: 'review-codex-96',
      subjectId,
      reviewer: {
        id: 'codex',
        type: 'agent',
        provider: 'codex'
      },
      verdict: 'issue',
      findings: [
        {
          findingId: 'codex-security-96',
          category: 'security',
          severity: 'high',
          summary: 'Security-sensitive review finding',
          evidenceRefs: ['file:src/main/security/review-policy.ts']
        }
      ],
      reviewedAt: '2026-09-30T15:42:00.000Z',
      evidenceRefs: ['review:codex:96']
    }
  ]
}
