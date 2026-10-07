import type { FeedbackImageAttachment } from './feedback-image-attachments'

export type FeedbackSubmissionType = 'feedback' | 'crash'

export type FeedbackSubmitArgs = {
  feedback: string
  submitAnonymously?: boolean
  githubLogin: string | null
  githubEmail: string | null
  images?: FeedbackImageAttachment[]
}

export type FeedbackDiagnosticBundleAttachment = {
  bundleSubmissionId: string
  content: string
  bytes: number
  spanCount: number
}

export type FeedbackRequestFailure = {
  status: number | null
  error: string
}

export type FeedbackSubmitResult =
  | {
      ok: true
      diagnosticBundleFailure?: FeedbackRequestFailure
      /** Absent when nothing was attached; false when the text landed but the images did not. */
      imagesDelivered?: boolean
    }
  | ({ ok: false } & FeedbackRequestFailure & {
      diagnosticBundleFailure?: FeedbackRequestFailure
    })
