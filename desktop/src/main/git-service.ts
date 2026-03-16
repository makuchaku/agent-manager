import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { copyFile, mkdir, readdir } from 'fs/promises'
import { promisify } from 'util'
import { dirname, join } from 'path'

const execFileAsync = promisify(execFile)

export interface FileStatus {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'
  staged: boolean
}

export interface FileDiff {
  path: string
  hunks: string
}

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    maxBuffer: 10 * 1024 * 1024,
  })
  return stdout.trimEnd()
}

function friendlyGitError(err: unknown, fallback: string): string {
  const stderr =
    typeof err === 'object' && err !== null && 'stderr' in err
      ? String((err as { stderr?: unknown }).stderr ?? '')
      : undefined
  if (!stderr) return fallback

  if (stderr.includes('invalid reference')) {
    const ref = stderr.match(/invalid reference: (.+)/)?.[1]?.trim()
    return ref ? `Branch "${ref}" not found` : 'Branch not found'
  }

  if (stderr.includes('a branch named')) return 'BRANCH_ALREADY_EXISTS'

  if (stderr.includes('already exists') && stderr.includes('checkout')) return 'BRANCH_CHECKED_OUT'

  if (stderr.includes('not a git repository')) return 'Not a git repository'

  const fatal = stderr.match(/fatal: (.+)/)?.[1]?.trim()
  if (fatal) return fatal

  return fallback
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next'])

async function copyEnvFiles(srcRoot: string, destRoot: string): Promise<void> {
  try {
    const entries = await readdir(srcRoot, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
        await copyEnvFiles(join(srcRoot, entry.name), destRoot)
      } else if (entry.isFile() && entry.name.startsWith('.env')) {
        const rel = join(srcRoot, entry.name).slice(srcRoot.length + 1)
        const dest = join(destRoot, rel)
        if (!existsSync(dest)) {
          await mkdir(dirname(dest), { recursive: true }).catch(() => {})
          await copyFile(join(srcRoot, entry.name), dest).catch(() => {})
        }
      }
    }
  } catch {}
}

export class GitService {
  static async getDefaultBranch(repoPath: string): Promise<string> {
    const hasOrigin = await this.hasRemote(repoPath, 'origin')

    if (hasOrigin) {
      await git(['remote', 'set-head', 'origin', '--auto'], repoPath).catch(() => {})

      const ref = await git(['symbolic-ref', 'refs/remotes/origin/HEAD'], repoPath).catch(() => '')
      if (ref) return ref.replace('refs/remotes/', '')

      for (const candidate of ['origin/main', 'origin/master']) {
        const exists = await git(['rev-parse', '--verify', `refs/remotes/${candidate}`], repoPath)
          .then(() => true, () => false)
        if (exists) return candidate
      }
    }

    const local = await git(['rev-parse', '--abbrev-ref', 'HEAD'], repoPath).catch(() => '')
    if (local && local !== 'HEAD') return local

    for (const candidate of ['main', 'master']) {
      const exists = await git(['rev-parse', '--verify', `refs/heads/${candidate}`], repoPath)
        .then(() => true, () => false)
      if (exists) return candidate
    }

    return 'main'
  }

  private static async hasRemote(repoPath: string, remoteName: string): Promise<boolean> {
    return git(['remote', 'get-url', remoteName], repoPath).then(
      () => true,
      () => false,
    )
  }

  static sanitizeBranchName(name: string): string {
    return name
      .trim()
      .replace(/\s+/g, '-')
      .replace(/\.{2,}/g, '-')
      .replace(/[\x00-\x1f\x7f~^:?*[\]\\]/g, '-')
      .replace(/\/{2,}/g, '/')
      .replace(/\/\./g, '/-')
      .replace(/@\{/g, '-')
      .replace(/\.lock(\/|$)/g, '-lock$1')
      .replace(/^[.\-/]+/, '')
      .replace(/[.\-/]+$/, '')
  }

  static async checkoutBranch(repoPath: string, branch: string): Promise<void> {
    const sanitized = GitService.sanitizeBranchName(branch)
    if (!sanitized) throw new Error('Branch name is empty after sanitization')

    const hasOrigin = await GitService.hasRemote(repoPath, 'origin')
    if (hasOrigin) {
      await git(['fetch', '--prune', 'origin'], repoPath).catch(() => {})
    }

    const branchExists = await git(['rev-parse', '--verify', `refs/heads/${sanitized}`], repoPath)
      .then(() => true, () => false)

    if (!branchExists) {
      const remoteExists = hasOrigin
        ? await git(['rev-parse', '--verify', `refs/remotes/origin/${sanitized}`], repoPath)
            .then(() => true, () => false)
        : false
      if (!remoteExists) {
        throw new Error(`Branch "${sanitized}" not found`)
      }
      await git(['checkout', '-b', sanitized, `-t`, `origin/${sanitized}`], repoPath)
    } else {
      await git(['checkout', sanitized], repoPath)
    }

    await git(['pull', '--rebase'], repoPath).catch(() => {})
  }

  static async createBranch(repoPath: string, branch: string, baseBranch?: string): Promise<void> {
    const sanitized = GitService.sanitizeBranchName(branch)
    if (!sanitized) throw new Error('Branch name is empty after sanitization')

    const branchExists = await git(['rev-parse', '--verify', `refs/heads/${sanitized}`], repoPath)
      .then(() => true, () => false)
    if (branchExists) {
      throw new Error('BRANCH_ALREADY_EXISTS')
    }

    let base = baseBranch
    if (!base) {
      base = await GitService.getDefaultBranch(repoPath)
    }

    await git(['checkout', '-b', sanitized, base], repoPath)
  }

  static async getTopLevel(cwd: string): Promise<string> {
    return git(['rev-parse', '--show-toplevel'], cwd)
  }

  static async getCurrentBranch(repoPath: string): Promise<string> {
    if (!existsSync(repoPath)) return ''
    try {
      return await git(['rev-parse', '--abbrev-ref', 'HEAD'], repoPath)
    } catch {
      return ''
    }
  }

  static async getStatus(repoPath: string): Promise<FileStatus[]> {
    const output = await git(
      ['status', '--porcelain=v1', '-uall'],
      repoPath
    )
    if (!output) return []

    const results: FileStatus[] = []

    for (const line of output.split('\n')) {
      const indexStatus = line[0]
      const workStatus = line[1]
      const path = line.slice(3)

      if (indexStatus === '?' && workStatus === '?') {
        results.push({ path, status: 'untracked', staged: false })
        continue
      }

      if (indexStatus !== ' ' && indexStatus !== '?') {
        const status: FileStatus['status'] =
          indexStatus === 'A' ? 'added' :
          indexStatus === 'D' ? 'deleted' :
          indexStatus === 'R' ? 'renamed' : 'modified'
        results.push({ path, status, staged: true })
      }

      if (workStatus !== ' ' && workStatus !== '?') {
        const status: FileStatus['status'] =
          workStatus === 'D' ? 'deleted' : 'modified'
        results.push({ path, status, staged: false })
      }
    }

    return results
  }

  static async getDiff(repoPath: string, staged: boolean): Promise<FileDiff[]> {
    const args = ['diff']
    if (staged) args.push('--staged')
    args.push('--unified=3')

    const output = await git(args, repoPath)
    if (!output) return []

    const files: FileDiff[] = []
    const parts = output.split(/^diff --git /m).filter(Boolean)

    for (const part of parts) {
      const firstLine = part.split('\n')[0]
      const match = firstLine.match(/b\/(.+)$/)
      if (match) {
        files.push({
          path: match[1],
          hunks: 'diff --git ' + part,
        })
      }
    }

    return files
  }

  static async getFileDiff(repoPath: string, filePath: string): Promise<string> {
    try {
      const unstaged = await git(['diff', '--', filePath], repoPath)
      if (unstaged) return unstaged
      return await git(['diff', '--staged', '--', filePath], repoPath)
    } catch {
      return ''
    }
  }

  static async getBranches(repoPath: string): Promise<string[]> {
    const [localOut, remoteOut] = await Promise.all([
      git(['branch', '--list', '--format=%(refname:short)'], repoPath),
      git(['branch', '-r', '--format=%(refname:short)'], repoPath).catch(() => ''),
    ])
    const seen = new Set<string>()
    const branches: string[] = []
    for (const name of localOut.split('\n').filter(Boolean)) {
      seen.add(name)
      branches.push(name)
    }
    for (const raw of remoteOut.split('\n').filter(Boolean)) {
      if (raw.endsWith('/HEAD')) continue
      const slash = raw.indexOf('/')
      const name = slash >= 0 ? raw.slice(slash + 1) : raw
      if (!seen.has(name)) {
        seen.add(name)
        branches.push(name)
      }
    }
    return branches
  }

  static async stage(repoPath: string, paths: string[]): Promise<void> {
    if (paths.length === 0) return
    await git(['add', '--', ...paths], repoPath)
  }

  static async unstage(repoPath: string, paths: string[]): Promise<void> {
    if (paths.length === 0) return
    await git(['reset', 'HEAD', '--', ...paths], repoPath)
  }

  static async discard(repoPath: string, paths: string[], untracked: string[]): Promise<void> {
    if (paths.length > 0) {
      await git(['checkout', '--', ...paths], repoPath)
    }
    if (untracked.length > 0) {
      await git(['clean', '-f', '--', ...untracked], repoPath)
    }
  }

  static async commit(repoPath: string, message: string): Promise<void> {
    await git(['commit', '-m', message], repoPath)
  }
}
