const MAX_TITLE_LENGTH = 30
const MAX_VISIBLE_TOKENS = 3

/** Common command aliases for better display */
const COMMAND_ALIASES: Record<string, string> = {
  'git': '🌿 git',
  'npm': '📦 npm',
  'yarn': '📦 yarn',
  'pnpm': '📦 pnpm',
  'bun': '📦 bun',
  'python': '🐍 python',
  'python3': '🐍 python3',
  'node': '⬢ node',
  'deno': '🦕 deno',
  'docker': '🐳 docker',
  'kubectl': '☸️ kubectl',
}

function truncateTitle(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return 'Terminal'
  if (trimmed.length <= MAX_TITLE_LENGTH) return trimmed
  return `${trimmed.slice(0, MAX_TITLE_LENGTH - 1)}…`
}

/** Extract command with alias resolution */
function resolveCommandAlias(cmd: string): string {
  return COMMAND_ALIASES[cmd] || cmd
}

function basename(pathValue: string): string {
  const trimmed = pathValue.replace(/['"]/g, '').trim()
  const segments = trimmed.split('/')
  return segments[segments.length - 1] || trimmed
}

export function titleFromTerminalCommand(rawCommand: string): string {
  let command = rawCommand.trim()
  if (!command) return 'Terminal'

  // Strip leading shell env assignments and wrappers.
  command = command
    .replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=(?:'[^']*'|"[^"]*"|\S+)\s+)*/g, '')
    .replace(/^(?:sudo|command|exec)\s+/g, '')
    .trim()
  if (!command) return 'Terminal'

  const tokens = command.split(/\s+/).slice(0, MAX_VISIBLE_TOKENS)
  const [tool, arg1, arg2] = tokens
  const displayTool = resolveCommandAlias(tool)

  if (tool === 'git' && arg1) return truncateTitle(`${displayTool} ${arg1}`)
  if ((tool === 'npm' || tool === 'pnpm' || tool === 'bun') && arg1 === 'run' && arg2) {
    return truncateTitle(`${tool}:${arg2}`)
  }
  if (tool === 'yarn' && arg1) return truncateTitle(`${displayTool}:${arg1}`)
  if ((tool === 'python' || tool === 'python3' || tool === 'node' || tool === 'deno') && arg1) {
    return truncateTitle(`${displayTool} ${basename(arg1)}`)
  }

  return truncateTitle(tokens.join(' '))
}
