export type AppTheme = 'dark' | 'light' | 'high-contrast'

export interface BootThemeSettings {
  theme: AppTheme
  reduceMotion: boolean
}

export const DEFAULT_BOOT_THEME_SETTINGS: BootThemeSettings = {
  theme: 'light',
  reduceMotion: false,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeTheme(value: unknown): AppTheme {
  if (value === 'dark' || value === 'high-contrast') return value
  return DEFAULT_BOOT_THEME_SETTINGS.theme
}

function parseTheme(value: unknown): AppTheme | null {
  if (value === 'dark' || value === 'light' || value === 'high-contrast') return value
  return null
}

function migrateLegacyEditorTheme(value: unknown): AppTheme | null {
  switch (value) {
    case 'vs':
      return 'light'
    case 'vs-dark':
      return 'dark'
    case 'hc-black':
      return 'high-contrast'
    default:
      return null
  }
}

function resolveThemeWithLegacySupport(themeValue: unknown, legacyEditorThemeValue: unknown): AppTheme {
  const explicitTheme = parseTheme(themeValue)
  const migratedTheme = migrateLegacyEditorTheme(legacyEditorThemeValue)

  return explicitTheme ?? migratedTheme ?? normalizeTheme(themeValue)
}

export function normalizeBootThemeSettings(value: unknown): BootThemeSettings {
  if (!isRecord(value)) return { ...DEFAULT_BOOT_THEME_SETTINGS }

  const reduceMotion = typeof value.reduceMotion === 'boolean'
    ? value.reduceMotion
    : DEFAULT_BOOT_THEME_SETTINGS.reduceMotion

  return {
    theme: resolveThemeWithLegacySupport(value.theme, value.editorTheme),
    reduceMotion,
  }
}
