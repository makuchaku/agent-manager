import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { useAppStore, hydrateFromDisk } from './store/app-store'
import { useEffect } from 'react'
import '@xterm/xterm/css/xterm.css'
import './styles/global.css'

console.log('[Renderer] Starting application...')

// Expose store for e2e testing
;(window as any).__store = useAppStore
console.log('[Renderer] Store exposed to window')

// Apply UI font size setting to CSS custom property
function UiFontSizeSetter() {
  const uiFontSize = useAppStore((s) => s.settings.uiFontSize)
  useEffect(() => {
    document.documentElement.style.setProperty('--text-base', `${uiFontSize}px`)
  }, [uiFontSize])
  return null
}

// Apply theme setting (dark/light) to data-theme attribute
function ThemeSetter() {
  const theme = useAppStore((s) => s.settings.theme)
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])
  return null
}

// Hydrate persisted state (tabs, PTYs) BEFORE rendering to avoid
// mounting terminals with stale pty IDs that get replaced moments later.
const rootElement = document.getElementById('root')
if (!rootElement) {
  console.error('[Renderer] Root element not found!')
  // Emergency fallback - render directly without hydration
  const fallback = document.createElement('div')
  fallback.innerHTML = '<h1 style="color: red; padding: 20px;">Root element not found!</h1>'
  document.body.appendChild(fallback)
  throw new Error('Root element not found')
}
console.log('[Renderer] Root element found, starting hydration...')

// Add timeout to prevent hanging if hydration never resolves
const hydrationTimeout = new Promise<void>((resolve) => {
  console.log('[Renderer] Setting 5s hydration timeout...')
  setTimeout(() => {
    console.log('[Renderer] Hydration timeout reached')
    resolve()
  }, 5000)
})

console.log('[Renderer] Starting Promise.race for hydration...')
Promise.race([hydrateFromDisk(), hydrationTimeout])
  .then((result) => {
    console.log('[Renderer] Hydration completed or timed out, result:', result)
    const root = createRoot(rootElement)
    console.log('[Renderer] Created root, rendering App...')
    root.render(
      <StrictMode>
        <UiFontSizeSetter />
        <ThemeSetter />
        <App />
      </StrictMode>
    )
    console.log('[Renderer] App rendered')
  })
  .catch((err) => {
    console.error('[Renderer] Failed to hydrate from disk:', err)
    // Still render the app even if hydration fails
    const root = createRoot(rootElement)
    root.render(
      <StrictMode>
        <UiFontSizeSetter />
        <ThemeSetter />
        <App />
      </StrictMode>
    )
  })
