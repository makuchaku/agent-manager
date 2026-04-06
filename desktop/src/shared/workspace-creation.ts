export const CREATE_WORKTREE_STAGES = [
  'prune-worktrees',
  'fetch-origin',
  'resolve-default-branch',
  'prepare-worktree-dir',
  'inspect-branch',
  'create-worktree',
  'sync-branch',
  'copy-env-files',
] as const

/** Total number of stages for progress calculation */
export const TOTAL_STAGES = CREATE_WORKTREE_STAGES.length

/** Calculate percentage completion for a given stage */
export function calculateProgress(stage: CreateWorktreeStage): number {
  const index = CREATE_WORKTREE_STAGES.indexOf(stage)
  return Math.round((index / (TOTAL_STAGES - 1)) * 100)
}

export type CreateWorktreeStage = (typeof CREATE_WORKTREE_STAGES)[number]

export interface CreateWorktreeProgress {
  stage: CreateWorktreeStage
  message: string
  /** Percentage complete (0-100) */
  percentComplete: number
  /** Timestamp when stage started */
  startedAt: number
  /** Number of retry attempts for this stage */
  retryCount: number
}

/** Cancellation token for aborting worktree creation */
export interface CancellationToken {
  isCancelled: boolean
  reason?: string
}

export interface CreateWorktreeProgressEvent extends CreateWorktreeProgress {
  requestId?: string
  /** Duration of current stage in milliseconds */
  stageDuration: number
}
