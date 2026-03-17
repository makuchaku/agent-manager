import { useEffect, useState, useCallback, useRef } from 'react'
import Editor, { loader } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { useAppStore } from '../../store/app-store'
import styles from './Editor.module.css'

// Disable TS/JS semantic diagnostics globally once — Monaco can't resolve project modules
let diagnosticsConfigured = false
loader.init().then((monaco) => {
  if (diagnosticsConfigured) return
  diagnosticsConfigured = true
  const diagnosticsOff = {
    noSemanticValidation: true,
    noSyntaxValidation: false,
    noSuggestionDiagnostics: true,
  }
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions(diagnosticsOff)
  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions(diagnosticsOff)
})

interface Props {
  tabId: string
  filePath: string
  active: boolean
}

// Map file extensions to Monaco language IDs
function getLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescriptreact',
    js: 'javascript',
    jsx: 'javascriptreact',
    json: 'json',
    md: 'markdown',
    css: 'css',
    html: 'html',
    py: 'python',
    rs: 'rust',
    go: 'go',
    yml: 'yaml',
    yaml: 'yaml',
    sh: 'shell',
    bash: 'shell',
    toml: 'ini',
  }
  return map[ext || ''] || 'plaintext'
}

/**
 * Check if a file is an image based on its extension.
 * 
 * BUG FIX: When implementing image loading support from explorer, the screen
 * would go white because Monaco editor cannot render binary image data. Monaco
 * expects text content, but when fs.readFile() loads an image, it returns
 * corrupted binary data as a string, which causes Monaco to crash.
 * 
 * This function detects image files so we can render them with a proper
 * <img> tag instead of Monaco editor.
 */
function isImageFile(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase()
  const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico']
  return imageExtensions.includes(ext || '')
}

/**
 * ImageViewer Component
 * 
 * Displays image files loaded from the file explorer. This prevents the white
 * screen crash that occurred when trying to render binary image data in Monaco.
 * 
 * @param filePath - The path to the image file to display
 */
function ImageViewer({ filePath }: { filePath: string }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Load image file as binary data and create an object URL
    // We use fetch to get the file as a blob, then createObjectURL
    const loadImage = async () => {
      try {
        // Use Electron's file:// protocol to load the image
        // We need to handle the path correctly for the browser
        const fileUrl = `file://${filePath}`
        
        const response = await fetch(fileUrl)
        if (!response.ok) {
          throw new Error(`Failed to load image: ${response.statusText}`)
        }
        
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        setObjectUrl(url)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load image')
      }
    }

    loadImage()

    // Cleanup: revoke the object URL when component unmounts
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [filePath])

  if (error) {
    return (
      <div className={styles.editorContainer} style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: '8px',
      }}>
        <div style={{ color: 'var(--text-error)', fontSize: 'var(--text-lg)' }}>⚠</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
          {error}
        </div>
      </div>
    )
  }

  if (!objectUrl) {
    return (
      <div className={styles.editorContainer} style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{ color: 'var(--text-tertiary)' }}>Loading image...</div>
      </div>
    )
  }

  return (
    <div className={styles.editorContainer} style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'auto',
      padding: '20px',
    }}>
      <img
        src={objectUrl}
        alt={`Image: ${filePath.split('/').pop()}`}
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
          borderRadius: '4px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        }}
      />
    </div>
  )
}

export function FileEditor({ tabId, filePath, active }: Props) {
  const [content, setContent] = useState<string | null>(null)
  const [unsaved, setUnsaved] = useState(false)
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const currentContentRef = useRef<string>('')
  const setTabUnsaved = useAppStore((s) => s.setTabUnsaved)
  const notifyTabSaved = useAppStore((s) => s.notifyTabSaved)
  const settings = useAppStore((s) => s.settings)

  /**
   * BUG FIX: Check if this is an image file before attempting to load it.
   * 
   * If the file is an image (png, jpg, etc.), we render it using the ImageViewer
   * component instead of Monaco editor. This prevents the white screen crash
   * that occurred when Monaco tried to render binary image data.
   * 
   * Monaco editor is designed for text files only and cannot handle binary
   * data such as images. When fs.readFile() reads an image file, it returns
   * corrupted binary data as a string, which causes Monaco to crash.
   */
  if (isImageFile(filePath)) {
    return <ImageViewer filePath={filePath} />
  }

  // Load file content
  useEffect(() => {
    let cancelled = false
    window.api.fs.readFile(filePath).then((text) => {
      if (!cancelled) {
        setContent(text)
        currentContentRef.current = text
        setUnsaved(false)
        setTabUnsaved(tabId, false)
      }
    })
    return () => { cancelled = true }
  }, [filePath, tabId, setTabUnsaved])

  const handleChange = useCallback((value: string | undefined) => {
    if (value !== undefined) {
      currentContentRef.current = value
      if (!unsaved) {
        setUnsaved(true)
        setTabUnsaved(tabId, true)
      }
    }
  }, [unsaved, tabId, setTabUnsaved])

  const handleSave = useCallback(async () => {
    await window.api.fs.writeFile(filePath, currentContentRef.current)
    setUnsaved(false)
    setTabUnsaved(tabId, false)
    notifyTabSaved(tabId)
  }, [filePath, tabId, setTabUnsaved, notifyTabSaved])

  // Auto-save on blur when setting is enabled
  const prevActiveRef = useRef(active)
  useEffect(() => {
    if (prevActiveRef.current && !active && unsaved && settings.autoSaveOnBlur) {
      handleSave()
    }
    prevActiveRef.current = active
  }, [active, unsaved, settings.autoSaveOnBlur, handleSave])

  // Cmd+S handler
  const handleEditorMount = useCallback((editorInstance: editor.IStandaloneCodeEditor) => {
    editorRef.current = editorInstance
    editorInstance.addCommand(
      // Monaco.KeyMod.CtrlCmd | Monaco.KeyCode.KeyS
      2048 | 49,
      () => handleSave()
    )
  }, [handleSave])

  if (content === null) {
    return (
      <div className={styles.editorContainer}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-sm)',
        }}>
          Loading...
        </div>
      </div>
    )
  }

  return (
    <div className={styles.editorContainer}>
      <Editor
        height="100%"
        language={getLanguage(filePath)}
        value={content}
        theme={settings.editorTheme}
        onChange={handleChange}
        onMount={handleEditorMount}
        options={{
          fontFamily: "'SF Mono', Menlo, 'Cascadia Code', monospace",
          fontSize: settings.editorFontSize,
          lineHeight: 20,
          minimap: { enabled: true },
          scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
          padding: { top: 8, bottom: 8 },
          renderLineHighlight: 'line',
          cursorBlinking: 'smooth',
          smoothScrolling: true,
          tabSize: 2,
          wordWrap: 'off',
          automaticLayout: true,
        }}
      />
    </div>
  )
}
