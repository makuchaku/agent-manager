import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { useAppStore, hydrateFromDisk, enablePersistence, enableRecoveryPersistence, getPersistedStateSnapshot } from './store/app-store'
import { useEffect, useState } from 'react'
import { applyResolvedThemeToDocument, resolveThemeState } from './theme/theme-policy'
import '@xterm/xterm/css/xterm.css'
import './styles/global.css'

const HYDRATION_TIMEOUT_MS = 5000

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

function ThemeRuntimeSync() {
  const theme = useAppStore((s) => s.settings.theme)
  const reduceMotion = useAppStore((s) => s.settings.reduceMotion)
  
  useEffect(() => {
    applyResolvedThemeToDocument(resolveThemeState({ theme, reduceMotion }))
    console.log(`[Renderer] Theme applied: ${theme}, reduceMotion: ${reduceMotion}`)
  }, [theme, reduceMotion])
  return null
}

const bootThemeSettings = window.api.state.loadBootThemeSync()
applyResolvedThemeToDocument(resolveThemeState(bootThemeSettings))
useAppStore.setState((state) => ({
  settings: {
    ...state.settings,
    theme: bootThemeSettings.theme,
    reduceMotion: bootThemeSettings.reduceMotion,
  },
}))

function tryRestoreRecoveryState(): boolean {
  try {
    const recoveryState = window.api.state.loadRecoverySync()
    if (!recoveryState) {
      return false
    }
    console.warn('[Renderer] Restoring session from recovery state')
    useAppStore.getState().hydrateState(recoveryState)
    const recoveredSettings = useAppStore.getState().settings
    applyResolvedThemeToDocument(resolveThemeState({
      theme: recoveredSettings.theme,
      reduceMotion: recoveredSettings.reduceMotion,
    }))
    window.api.state.clearRecoverySync()
    return true
  } catch (err) {
    console.error('[Renderer] Failed to restore recovery state:', err)
    return false
  }
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
let hydrationTimedOut = false
let hydrationSettled = false
let hydrationApplyingState = false
let hydrationAbandoned = false
let liveSessionChangedWhileHydrating = false

const unsubscribeHydrationGuard = useAppStore.subscribe((state, prevState) => {
  if ((!hydrationTimedOut && !hydrationAbandoned) || hydrationSettled || hydrationApplyingState) return
  if (getPersistedStateSnapshot(state) !== getPersistedStateSnapshot(prevState)) {
    liveSessionChangedWhileHydrating = true
  }
})

let appRendered = false

function renderApp() {
  if (appRendered) return
  appRendered = true

  const root = createRoot(rootElement)
  console.log('[Renderer] Created root, rendering App...')
  root.render(
    <StrictMode>
      <UiFontSizeSetter />
      <ThemeRuntimeSync />
      <App />
    </StrictMode>
  )
  console.log('[Renderer] App rendered')
}

console.log(`[Renderer] Setting ${HYDRATION_TIMEOUT_MS / 1000}s hydration timeout...`)
const hydrationTimer = window.setTimeout(() => {
  hydrationTimedOut = true
  console.log('[Renderer] Hydration timeout reached, continuing with boot state')
  hydrationAbandoned = true
  unsubscribeHydrationGuard()
  tryRestoreRecoveryState()
  enableRecoveryPersistence()
  renderApp()
}, HYDRATION_TIMEOUT_MS)

console.log('[Renderer] Starting hydration from disk...')
hydrateFromDisk({
  shouldApply: () => !liveSessionChangedWhileHydrating,
  onWillApplyState: () => {
    hydrationApplyingState = true
  },
  onDidApplyState: () => {
    hydrationApplyingState = false
  },
})
  .then((hydrationResult) => {
    if (hydrationAbandoned) {
      console.warn('[Renderer] Ignoring late hydration result after timeout recovery path took over')
      return
    }
    hydrationSettled = true
    unsubscribeHydrationGuard()

    const shouldEnablePersistence =
      hydrationResult.status === 'applied' ||
      hydrationResult.status === 'empty'

    if (!hydrationTimedOut) {
      console.log('[Renderer] Hydration completed before timeout')
      if (hydrationResult.status === 'load-failed') {
        console.error('[Renderer] Persisted state failed to load; switching to recovery persistence for this session')
        tryRestoreRecoveryState()
        enableRecoveryPersistence()
      } else if (hydrationResult.status === 'skipped-live-session') {
        console.warn('[Renderer] Skipping persisted state for this session; using recovery persistence')
        enableRecoveryPersistence()
      }
      renderApp()
      if (shouldEnablePersistence) {
        enablePersistence()
      } else if (hydrationResult.status === 'load-failed' || hydrationResult.status === 'skipped-live-session') {
        console.warn('[Renderer] Using recovery persistence to avoid overwriting persisted state')
      } else {
        console.warn('[Renderer] Leaving persistence disabled for this session to avoid overwriting persisted state')
      }
      return
    }

    if (hydrationResult.status === 'applied') {
      console.log('[Renderer] Hydration completed after timeout and safely restored persisted state')
      enablePersistence()
    } else if (hydrationResult.status === 'skipped-live-session') {
      console.warn('[Renderer] Skipping late hydration because the live session changed before hydration settled')
    } else if (hydrationResult.status === 'load-failed') {
      console.error('[Renderer] Persisting to recovery state because persisted state failed to load after timeout')
    } else if (hydrationResult.status === 'empty') {
      console.log('[Renderer] No persisted state found after timeout; switching back to primary persistence')
      enablePersistence()
    }
  })
  .catch((err) => {
    if (hydrationAbandoned) {
      console.warn('[Renderer] Ignoring late hydration failure after timeout recovery path took over')
      return
    }
    hydrationSettled = true
    unsubscribeHydrationGuard()
    console.error('[Renderer] Failed to hydrate from disk:', err)
    tryRestoreRecoveryState()
    enableRecoveryPersistence()
    renderApp()
    console.warn('[Renderer] Using recovery persistence to avoid overwriting persisted state')
  })
  .finally(() => {
    window.clearTimeout(hydrationTimer)
  })
