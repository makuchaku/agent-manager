import * as pty from 'node-pty'
import { WebContents } from 'electron'
import { IPC } from '../shared/ipc-channels'
import { existsSync } from 'fs'

interface PtyInstance {
  process: pty.IPty
  webContents: WebContents
  onExitCallbacks: Array<(exitCode: number) => void>
  cols: number
  rows: number
  outputSeq: number
  replayChunks: string[]
  replayChars: number
  projectId?: string
  createdAt: number
  shellVersion?: string
}

function findValidShell(preferredShell?: string): string {
  // If a specific shell is requested, try it first
  if (preferredShell && preferredShell.trim()) {
    const trimmed = preferredShell.trim()
    if (existsSync(trimmed)) {
      return trimmed
    }
    console.warn(`[pty] Requested shell not found: ${trimmed}, trying fallbacks`)
  }
  
  // Try environment SHELL
  const envShell = process.env.SHELL
  if (envShell && existsSync(envShell)) {
    return envShell
  }
  
  // Platform-specific fallbacks
  const isWindows = process.platform === 'win32'
  if (isWindows) {
    // BUG FIX: Always use pwsh.exe (PowerShell 7+) on Windows
    // 
    // REASONING:
    // - pwsh.exe is the modern cross-platform PowerShell (v7+)
    // - It provides better compatibility with modern tooling and scripts
    // - Windows PowerShell (powershell.exe v5.1) is legacy and lacks modern features
    // - pwsh.exe is the standard executable name for PowerShell Core/7+
    // 
    // REQUIREMENT:
    // - PowerShell 7+ must be installed on the system
    // - Download from: https://github.com/PowerShell/PowerShell/releases
    // - Or install via: winget install Microsoft.PowerShell
    // 
    // FALLBACK:
    // - If pwsh.exe is not found in PATH, node-pty spawn will fail
    // - The error will be caught and propagated to the UI
    // - Users should install PowerShell 7+ to use terminal features
    return 'pwsh.exe'
  }
  
  // macOS/Linux fallbacks - prioritize zsh on macOS, bash on Linux
  const isMac = process.platform === 'darwin'
  const fallbackShells = isMac
    ? ['/bin/zsh', '/bin/bash', '/bin/sh']
    : ['/bin/bash', '/bin/sh', '/bin/zsh']
  
  for (const shell of fallbackShells) {
    if (existsSync(shell)) {
      console.info(`[pty] Using fallback shell: ${shell}`)
      return shell
    }
  }
  
  // Last resort
  throw new Error('No valid shell found. Tried: ' + 
    (preferredShell ? [preferredShell, envShell, ...fallbackShells].join(', ') : 
      [envShell, ...fallbackShells].join(', ')))
}

const PTY_REPLAY_BUFFER_MAX_CHARS = 8_000_000

function stripAnsiSequences(data: string): string {
  return data
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b\].*?(?:\x07|\x1b\\)/g, '')
    .replace(/\x1bP.*?\x1b\\/g, '')
}

function appendReplayChunk(instance: PtyInstance, chunk: string): void {
  if (!chunk) return

  if (chunk.length >= PTY_REPLAY_BUFFER_MAX_CHARS) {
    const tail = chunk.slice(chunk.length - PTY_REPLAY_BUFFER_MAX_CHARS)
    instance.replayChunks = [tail]
    instance.replayChars = tail.length
    return
  }

  instance.replayChunks.push(chunk)
  instance.replayChars += chunk.length

  while (instance.replayChars > PTY_REPLAY_BUFFER_MAX_CHARS && instance.replayChunks.length > 0) {
    const removed = instance.replayChunks.shift()
    if (!removed) break
    instance.replayChars -= removed.length
  }
}

export class PtyManager {
  private ptys = new Map<string, PtyInstance>()
  private nextId = 0
  private readonly platform = process.platform
  private readonly isWindows = process.platform === 'win32'
  private readonly isMac = process.platform === 'darwin'

  create(workingDir: string, webContents: WebContents, shell?: string, command?: string[], initialWrite?: string, extraEnv?: Record<string, string>): string {
    const createStart = Date.now()
    const id = `pty-${++this.nextId}`
    
    // Track memory usage
    const memBefore = process.memoryUsage().heapUsed

    let file: string
    let args: string[]
    if (command && command.length > 0) {
      file = command[0]
      args = command.slice(1)
    } else {
      const isWindows = process.platform === 'win32'
      if (isWindows) {
        // Check if WSL is explicitly requested or available
        const preferredShell = shell?.trim()
        if (preferredShell && preferredShell.toLowerCase().includes('wsl')) {
          file = 'wsl.exe'
          args = ['-d', 'Ubuntu']
        } else {
          // Use PowerShell or cmd on Windows
          file = findValidShell(preferredShell)
          args = []
        }
      } else {
        // macOS and Linux - find a valid shell
        file = findValidShell(shell)
        args = []
      }
    }
    
    // Validate the file exists before spawning (only for absolute paths)
    // Note: Commands on PATH like 'powershell.exe' don't need full paths
    if (file.includes('/') || file.includes('\\')) {
      if (!existsSync(file)) {
        throw new Error(`Shell not found at path: ${file}`)
      }
    }
    
    // Validate working directory exists
    let finalCwd = workingDir
    if (workingDir && !existsSync(workingDir)) {
      console.warn(`[pty] Working directory does not exist: ${workingDir}, using process.cwd()`)
      finalCwd = process.cwd()
    }
    if (!finalCwd) {
      finalCwd = process.cwd()
    }
    
    console.info(`[pty] Spawning shell: ${file} (cwd: ${workingDir || 'default'})`)

    // Build environment for PTY process
    // 
    // BUG FIX: Restore full process.env inheritance for Windows
    //
    // REASONING:
    // - The original implementation (commit 9bf0dab) used `...process.env` to inherit ALL
    //   environment variables from the parent Electron process
    // - Commit 9d8cea8 "Fixes for mac" changed to "minimal environment" approach which only
    //   copies specific whitelisted variables
    // - This broke Windows applications (including PowerShell and opencode) that depend
    //   on many environment variables not included in the minimal list
    // - Windows requires many variables for proper operation: ComSpec, ProgramFiles,
    //   TEMP, TMP, and dozens more for application compatibility
    //
    // IMPLEMENTATION:
    // - Start with all parent process environment variables using `...process.env`
    // - Override TERM and COLORTERM to ensure proper terminal capability detection
    // - Override SHELL to match the actual shell being spawned
    // - Allow extraEnv to add any custom variables needed
    //
    // SECURITY NOTE:
    // - Inheriting all env vars from Electron is generally safe
    // - Node/Electron env vars are harmless to child processes
    // - This is standard practice for terminal emulators
    const env: Record<string, string> = {
      ...process.env,  // Inherit ALL environment variables (critical for Windows)
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',  // Required for modern TUI apps (opencode, etc.)
      SHELL: file,
      ...extraEnv,
    }
    
    // Ensure critical variables are strings (not undefined)
    if (!env.PATH) env.PATH = process.env.PATH || '/usr/local/bin:/usr/bin:/bin'
    if (!env.HOME) env.HOME = process.env.HOME || ''

    let proc: pty.IPty
    let attemptedShells = [file]
    
    try {
      proc = pty.spawn(file, args, {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: finalCwd,
        env,
      })
    } catch (error) {
      console.error(`[pty] Failed to spawn ${file}, trying fallback...`, error)
      
      // Try /bin/sh as ultimate fallback
      const fallbackShell = '/bin/sh'
      if (file !== fallbackShell && existsSync(fallbackShell)) {
        attemptedShells.push(fallbackShell)
        env.SHELL = fallbackShell
        try {
          proc = pty.spawn(fallbackShell, [], {
            name: 'xterm-256color',
            cols: 80,
            rows: 24,
            cwd: finalCwd,
            env,
          })
          console.info(`[pty] Fallback to ${fallbackShell} succeeded`)
        } catch (fallbackError) {
          console.error(`[pty] Fallback also failed:`, fallbackError)
          throw new Error(`Failed to spawn shell. Tried: ${attemptedShells.join(', ')}. Error: ${error instanceof Error ? error.message : String(error)}`)
        }
      } else {
        throw new Error(`Failed to spawn shell ${file}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    const instance: PtyInstance = {
      process: proc,
      webContents,
      onExitCallbacks: [],
      cols: 80,
      rows: 24,
      outputSeq: 0,
      replayChunks: [],
      replayChars: 0,
      projectId: extraEnv?.AGENT_ORCH_PROJECT_ID,
      createdAt: Date.now(),
      shellVersion: undefined
    }
    
    const memAfter = process.memoryUsage().heapUsed
    console.log(`[pty] Created ${id} in ${Date.now() - createStart}ms, memory delta: ${((memAfter - memBefore) / 1024).toFixed(2)}KB`)

    let pendingWrite = initialWrite
    proc.onData((data) => {
      const startSeq = instance.outputSeq
      instance.outputSeq += data.length
      appendReplayChunk(instance, data)
      if (!instance.webContents.isDestroyed()) {
        instance.webContents.send(`${IPC.PTY_DATA}:${id}`, startSeq, data)
      }
      // Write initial command on first output (shell is ready)
      if (pendingWrite) {
        const toWrite = pendingWrite
        pendingWrite = undefined
        proc.write(toWrite)
      }
    })

    proc.onExit(({ exitCode }) => {
      for (const cb of instance.onExitCallbacks) cb(exitCode)
      this.ptys.delete(id)
    })

    this.ptys.set(id, instance)
    return id
  }

  onExit(ptyId: string, callback: (exitCode: number) => void): void {
    const instance = this.ptys.get(ptyId)
    if (instance) instance.onExitCallbacks.push(callback)
  }

  write(ptyId: string, data: string): void {
    const instance = this.ptys.get(ptyId)
    if (!instance) return
    instance.process.write(data)
  }

  resize(ptyId: string, cols: number, rows: number): void {
    const instance = this.ptys.get(ptyId)
    if (instance) {
      if (instance.cols === cols && instance.rows === rows) return
      instance.cols = cols
      instance.rows = rows
      instance.process.resize(cols, rows)
    }
  }

  destroy(ptyId: string): void {
    const instance = this.ptys.get(ptyId)
    if (instance) {
      instance.codexTurnActive = false
      instance.crushTurnActive = false
      if (instance.crushSilenceTimer) {
        clearTimeout(instance.crushSilenceTimer)
        instance.crushSilenceTimer = null
      }
      instance.process.kill()
      this.ptys.delete(ptyId)
    }
  }

  /** Return IDs of all live PTY processes */
  list(): string[] {
    return Array.from(this.ptys.keys())
  }

  /** Update the webContents reference for an existing PTY (e.g. after renderer reload) */
  reattach(
    ptyId: string,
    webContents: WebContents,
    sinceSeq?: number
  ): { ok: boolean; replay?: string; baseSeq: number; endSeq: number; truncated: boolean; cols: number; rows: number } {
    const instance = this.ptys.get(ptyId)
    if (!instance) return { ok: false, baseSeq: 0, endSeq: 0, truncated: false, cols: 0, rows: 0 }
    instance.webContents = webContents

    const endSeq = instance.outputSeq
    const baseSeq = Math.max(0, endSeq - instance.replayChars)
    const requestedSince = typeof sinceSeq === 'number' && Number.isFinite(sinceSeq) ? Math.max(0, Math.floor(sinceSeq)) : baseSeq
    const truncated = requestedSince < baseSeq

    let replayData: string | undefined
    if (instance.replayChunks.length > 0 && requestedSince < endSeq) {
      const joined = instance.replayChunks.join('')
      const offset = Math.max(0, requestedSince - baseSeq)
      replayData = joined.slice(offset)
    }

    return { ok: true, replay: replayData, baseSeq, endSeq, truncated, cols: instance.cols, rows: instance.rows }
  }

  destroyAll(): void {
    for (const [id] of this.ptys) {
      this.destroy(id)
    }
  }
}
