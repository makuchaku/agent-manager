import type { ITerminalOptions } from '@xterm/xterm'
import { normalizeBootThemeSettings, type AppTheme, type BootThemeSettings } from '../../shared/theme-settings'

export interface ThemeSettingsInput {
  theme: AppTheme
  reduceMotion?: boolean
}

export interface ResolvedThemeState {
  theme: AppTheme
  reduceMotion: boolean
  monacoTheme: 'vs' | 'vs-dark' | 'hc-black'
  diffTheme: 'light' | 'tokyo-night' | 'github-dark-high-contrast'
  diffThemeType: 'light' | 'dark'
  terminalTheme: NonNullable<ITerminalOptions['theme']>
}

const FIXED_DARK_TERMINAL_THEME: NonNullable<ITerminalOptions['theme']> = {
  background: '#13141b',
  foreground: '#c0caf5',
  cursor: '#c0caf5',
  selectionBackground: 'rgba(122, 162, 247, 0.2)',
  black: '#15161e',
  red: '#f7768e',
  green: '#9ece6a',
  yellow: '#e0af68',
  blue: '#7aa2f7',
  magenta: '#bb9af7',
  cyan: '#7dcfff',
  white: '#a9b1d6',
  brightBlack: '#414868',
  brightRed: '#f7768e',
  brightGreen: '#9ece6a',
  brightYellow: '#e0af68',
  brightBlue: '#7aa2f7',
  brightMagenta: '#bb9af7',
  brightCyan: '#7dcfff',
  brightWhite: '#c0caf5',
}

export function resolveThemeState(input: ThemeSettingsInput | BootThemeSettings): ResolvedThemeState {
  const normalized = normalizeBootThemeSettings(input)
  const isLight = normalized.theme === 'light'
  const isHighContrast = normalized.theme === 'high-contrast'

  return {
    theme: normalized.theme,
    reduceMotion: normalized.reduceMotion,
    monacoTheme: isHighContrast ? 'hc-black' : (isLight ? 'vs' : 'vs-dark'),
    diffTheme: isHighContrast ? 'github-dark-high-contrast' : (isLight ? 'light' : 'tokyo-night'),
    diffThemeType: isLight ? 'light' : 'dark',
    // V1 keeps the terminal palette fixed-dark by policy.
    terminalTheme: FIXED_DARK_TERMINAL_THEME,
  }
}

export function applyResolvedThemeToDocument(theme: ResolvedThemeState): void {
  document.documentElement.setAttribute('data-theme', theme.theme)
  if (theme.reduceMotion) {
    document.documentElement.setAttribute('data-reduce-motion', 'true')
  } else {
    document.documentElement.removeAttribute('data-reduce-motion')
  }
}
