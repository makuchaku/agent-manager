import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { useAppStore, hydrateFromDisk } from './store/app-store'
import { useEffect, useState } from 'react'
import '@xterm/xterm/css/xterm.css'
import './styles/global.css'

console.log('[Renderer] Starting application...')
console.log(`[Renderer] Build timestamp: ${new Date().toISOString()}`)

// Feature flags for gradual rollout
const FEATURE_FLAGS = {
  enableNewShortcuts: true,
  enablePerformanceMetrics: process.env.NODE_ENV === 'development',
  enableErrorBoundary: true,
}

// Expose store for e2e testing
;(window as any).__store = useAppStore
console.log('[Renderer] Store exposed to window')

// Apply UI font size setting to CSS custom property
function UiFontSizeSetter() {
  const uiFontSize = useAppStore((s) => s.settings.uiFontSize)
  const [mounted, setMounted] = useState(false)
  
  useEffect(() => {
    document.documentElement.style.setProperty('--text-base', `${uiFontSize}px`)
    setMounted(true)
    console.log(`[Renderer] Font size applied: ${uiFontSize}px`)
  }, [uiFontSize])
  
  return mounted ? null : <div style={{ display: 'none' }}>Loading...</div>
}

// Apply theme setting (dark/light) to data-theme attribute
function ThemeSetter() {
  const theme = useAppStore((s) => s.settings.theme)
  const reduceMotion = useAppStore((s) => s.settings.reduceMotion)
  
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    if (reduceMotion) {
      document.documentElement.setAttribute('data-reduce-motion', 'true')
    }
    console.log(`[Renderer] Theme applied: ${theme}, reduceMotion: ${reduceMotion}`)
  }, [theme, reduceMotion])
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
