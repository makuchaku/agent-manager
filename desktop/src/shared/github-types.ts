export type PrState = 'open' | 'merged' | 'closed'

/**
 * Represents the state of a Pull Request.
 * - 'open': PR is currently open and under review
 * - 'merged': PR has been merged
 * - 'closed': PR was closed without merging
 */
export type CheckStatus = 'pending' | 'passing' | 'failing' | 'none'

/** GitHub API lookup error types */
export type GithubLookupError = 'gh_not_installed' | 'not_authenticated' | 'not_github_repo'

export interface PrInfo {
  /** PR number (e.g., 42) */
  readonly number: number
  /** PR state */
  readonly state: PrState
  /** PR title */
  readonly title: string
  /** PR URL */
  readonly url: string
  /** Check status */
  readonly checkStatus: CheckStatus
  /** Whether PR has pending review comments */
  readonly hasPendingComments: boolean
  /** Number of pending review comments */
  readonly pendingCommentCount: number
  /** Whether PR is blocked by CI failures */
  readonly isBlockedByCi: boolean
  /** Whether PR has been approved */
  readonly isApproved: boolean
  /** Whether changes have been requested */
  readonly isChangesRequested: boolean
  /** ISO timestamp of last update */
  readonly updatedAt: string
}

/**
 * Type guard to check if a value is a valid PrInfo object
 */
export function isPrInfo(value: unknown): value is PrInfo {
  if (!value || typeof value !== 'object') return false
  const pr = value as PrInfo
  return (
    typeof pr.number === 'number' &&
    typeof pr.title === 'string' &&
    typeof pr.url === 'string' &&
    ['open', 'merged', 'closed'].includes(pr.state)
  )
}

/** Utility type for PR state transitions */
export type PrStateTransition = {
  from: PrState
  to: Exclude<PrState, 'open'> // Can only transition away from open
}

export interface PrLookupResult {
  available: boolean
  error?: GithubLookupError
  data: Record<string, PrInfo | null>
}

export interface OpenPrInfo extends PrInfo {
  headRefName: string
  authorLogin?: string
}

export interface ListOpenPrsResult {
  available: boolean
  error?: GithubLookupError
  data: OpenPrInfo[]
}
