import { useEffect } from 'react'
import { useAppStore } from '../store/app-store'

/**
 * Helper function to check if the keyboard event target is within a terminal.
 * This is used to bypass app-level shortcuts when the user is interacting with
 * the terminal, allowing system defaults (copy/paste/ctrl+p) to work properly.
 */
function isTerminalFocused(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (!element) return false
  // Check if the target or any of its parents has the terminalInner class
  return !!element.closest?.('[class*="terminalInner"]')
}

export function useShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Shift+Enter handling when terminal is focused
      if (e.key === 'Enter' && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey
        && isTerminalFocused(e.target)) {
        // Write kitty keyboard protocol so CLIs (e.g. Claude Code) can distinguish
        // Shift+Enter (new line) from Enter (submit).
        e.preventDefault()
        e.stopPropagation()
        const s = useAppStore.getState()
        const tab = s.tabs.find((t) => t.id === s.activeTabId)
        if (tab?.type === 'terminal') {
          window.api.pty.write(tab.ptyId, '\x1b[13;2u')
        }
        return
      }

      // SYSTEM DEFAULT SHORTCUT BYPASS: When terminal is focused, allow
      // system defaults for copy/paste (Ctrl+C/V) and Ctrl+P to work.
      // Do not intercept these shortcuts in the capture phase - let them
      // bubble to the terminal where xterm.js and the OS handle them.
      const isTerminal = isTerminalFocused(e.target)
      const isCopyOrPaste = (e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'v' || e.key === 'x')
      const isPrint = (e.ctrlKey || e.metaKey) && e.key === 'p' && !e.shiftKey && !e.altKey
      
      if (isTerminal && (isCopyOrPaste || isPrint)) {
        // Allow these events to pass through to the terminal/system.
        // Do not call preventDefault() or stopPropagation().
        // xterm.js will handle Ctrl+C (copy if selection, else SIGINT)
        // and Ctrl+P will pass through to the shell or system print dialog.
        return
      }

      // Cmd+Left/Right/Backspace: macOS line-editing conventions.
      // Only Cmd (not Ctrl) — Ctrl+arrow is word movement handled by shells/TUIs.
      if (e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey
        && isTerminalFocused(e.target)) {
        const s = useAppStore.getState()
        const tab = s.tabs.find((t) => t.id === s.activeTabId)
        if (tab?.type === 'terminal') {
          if (e.key === 'ArrowLeft') {
            e.preventDefault()
            e.stopPropagation()
            window.api.pty.write(tab.ptyId, '\x01') // Ctrl+A — beginning of line
            return
          }
          if (e.key === 'ArrowRight') {
            e.preventDefault()
            e.stopPropagation()
            window.api.pty.write(tab.ptyId, '\x05') // Ctrl+E — end of line
            return
          }
          if (e.key === 'Backspace') {
            e.preventDefault()
            e.stopPropagation()
            window.api.pty.write(tab.ptyId, '\x15') // Ctrl+U — kill to beginning of line
            return
          }
        }
      }

      const meta = e.metaKey || e.ctrlKey
      const shift = e.shiftKey
      const alt = e.altKey
      if (!meta) return

      const store = useAppStore.getState()

      // Stop event from reaching terminal (capture phase — must stopPropagation)
      function consume() {
        e.preventDefault()
        e.stopPropagation()
      }

      // ── Quick open: Cmd+P ──
      // Note: Ctrl/Cmd+P is handled above to bypass when terminal is focused.
      // This handler only triggers when the terminal is NOT focused.
      if (!shift && !alt && e.key === 'p') {
        consume()
        store.toggleQuickOpen()
        return
      }

      // ── Tab switching: Cmd+1-9 ──
      if (!shift && !alt && e.key >= '1' && e.key <= '9') {
        consume()
        store.switchToTabByIndex(parseInt(e.key) - 1)
        return
      }

      // ── Workspace switching: Cmd+Shift+Up / Cmd+Shift+Down ──
      if (shift && !alt && e.key === 'ArrowUp') {
        consume()
        store.prevWorkspace()
        return
      }
      if (shift && !alt && e.key === 'ArrowDown') {
        consume()
        store.nextWorkspace()
        return
      }

      // ── Tab management ──
      if (!shift && !alt && e.key === 't') {
        consume()
        store.createTerminalForActiveProject()
        return
      }
      if (shift && !alt && e.code === 'KeyN') {
        consume()
        store.createTerminalForActiveProject()
        return
      }
      if (!shift && !alt && e.key === 'w') {
        consume()
        store.closeActiveTab()
        return
      }
      if (shift && !alt && e.code === 'KeyW') {
        consume()
        store.closeAllWorkspaceTabs()
        return
      }
      if (shift && !alt && e.key === ']') {
        consume()
        store.nextTab()
        return
      }
      if (shift && !alt && e.key === '[') {
        consume()
        store.prevTab()
        return
      }

      // ── Panels ──
      // Cmd+B — toggle sidebar (left)
      if (!shift && !alt && e.key === 'b') {
        consume()
        store.toggleSidebar()
        return
      }
      // Cmd+Option+B — toggle right panel (use e.code since Option changes e.key on macOS)
      if (!shift && alt && e.code === 'KeyB') {
        consume()
        store.toggleRightPanel()
        return
      }
      // Cmd+Shift+E — files panel (open if closed)
      if (shift && !alt && e.code === 'KeyE') {
        consume()
        store.setRightPanelMode('files')
        if (!store.rightPanelOpen) store.toggleRightPanel()
        return
      }
       // ── Focus ──
      // Cmd+J — focus terminal (or create one)
      if (!shift && !alt && e.key === 'j') {
        consume()
        store.focusOrCreateTerminal()
        return
      }

      // ── Font size: Cmd+= / Cmd+- / Cmd+0 ──
      if (!shift && !alt && (e.key === '=' || e.key === '-' || e.key === '0')) {
        consume()
        const tab = store.tabs.find((t) => t.id === store.activeTabId)
        const isTerminal = tab?.type === 'terminal'
        const key = isTerminal ? 'terminalFontSize' : 'editorFontSize'
        if (e.key === '0') {
          store.updateSettings({ terminalFontSize: 14, editorFontSize: 13 })
        } else {
          const current = store.settings[key]
          const next = Math.max(8, Math.min(32, current + (e.key === '=' ? 1 : -1)))
          store.updateSettings({ [key]: next })
        }
        return
      }

       // ── Settings ──
       // Cmd+, — toggle settings
       if (!shift && !alt && e.key === ',') {
         consume()
         store.toggleSettings()
         return
       }

       // ── Layout Reset ──
       // Cmd+Shift+0 — reset UI layout to default
       if (shift && !alt && e.key === '0') {
         consume()
         store.resetUILayout()
         return
       }

       // ── Workspace creation ──
       // Cmd+N — new workspace dialog
       if (!shift && !alt && e.key === 'n') {
         consume()
         const project = store.activeProject()
         if (project) {
           store.openWorkspaceDialog(project.id)
         } else if (store.projects.length === 1) {
           store.openWorkspaceDialog(store.projects[0].id)
         }
         return
       }

        // ── Split Operations ──
        // Cmd+\ — split current tab vertically (side-by-side)
        if (!shift && !alt && e.key === '\\') {
          consume()
          store.splitCurrentTab('vertical')
          return
        }
     }

    // Capture phase: runs before terminal handlers on the focused textarea.
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [])

  // Image paste: terminal textareas ignore clipboard images, so intercept and save to temp file.
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const target = e.target as HTMLElement
      if (!target?.closest?.('[class*="terminalInner"]')) return
      if (!e.clipboardData) return

      const hasImage = Array.from(e.clipboardData.items).some(
        (item) => item.type.startsWith('image/')
      )
      if (!hasImage) return

      e.preventDefault()
      e.stopPropagation()

      const filePath = await window.api.clipboard.saveImage()
      if (!filePath) return

      const s = useAppStore.getState()
      const tab = s.tabs.find((t) => t.id === s.activeTabId)
      if (tab?.type === 'terminal') {
        window.api.pty.write(tab.ptyId, `\x1b[200~${filePath}\x1b[201~`)
      }
    }

    document.addEventListener('paste', handlePaste, true)
    return () => document.removeEventListener('paste', handlePaste, true)
  }, [])
}
