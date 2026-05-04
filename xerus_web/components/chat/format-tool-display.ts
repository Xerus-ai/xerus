// Smart tool display formatting
// Converts raw tool names + args into human-readable labels.
// Strips Daytona workspace paths, summarizes bash commands,
// and produces verb-based labels + target/detail strings.

const WORKSPACE_PREFIXES = [
  '/home/daytona/projects/',
  '/home/daytona/',
  '/workspace/',
]

function stripWorkspacePath(raw: string): string {
  for (const prefix of WORKSPACE_PREFIXES) {
    if (raw.startsWith(prefix)) {
      const stripped = raw.slice(prefix.length)
      const parts = stripped.split('/')
      if (parts.length > 2) {
        return parts.slice(1).join('/')
      }
      return stripped
    }
  }
  return raw
}

function basename(path: string): string {
  const segments = path.split('/')
  return segments[segments.length - 1] || path
}

function getString(args: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const val = args[key]
    if (typeof val === 'string' && val) return val
  }
  return undefined
}

export interface ToolDisplay {
  label: string
  target?: string
  detail?: string
}

function formatFilePath(path: string): { file: string; relative?: string } {
  const clean = stripWorkspacePath(path)
  const file = basename(clean)
  if (file === clean) return { file }
  return { file, relative: clean }
}

function formatBash(command: string): ToolDisplay {
  const trimmed = command.trim()
  const cdMatch = trimmed.match(/^cd\s+\S+\s*&&\s*(.+)$/)
  const effective = cdMatch ? cdMatch[1].trim() : trimmed

  if (/^(npm|npx|yarn|pnpm|bun)\s/.test(effective)) {
    const first80 = effective.length > 80 ? effective.slice(0, 77) + '...' : effective
    return { label: 'Ran command', target: first80 }
  }

  if (/^git\s/.test(effective)) {
    const first80 = effective.length > 80 ? effective.slice(0, 77) + '...' : effective
    return { label: 'Ran command', target: first80 }
  }

  const mkdirMatch = effective.match(/^mkdir\s+(?:-p\s+)?(.+)$/)
  if (mkdirMatch) {
    return { label: 'Created directory', target: basename(stripWorkspacePath(mkdirMatch[1].trim())) }
  }

  const rmMatch = effective.match(/^rm\s+(?:-rf?\s+)?(.+)$/)
  if (rmMatch) {
    return { label: 'Removed', target: basename(stripWorkspacePath(rmMatch[1].trim())) }
  }

  const catMatch = effective.match(/^(cat|head|tail)\s+(.+)$/)
  if (catMatch) {
    return { label: 'Read file', target: basename(stripWorkspacePath(catMatch[2].trim())) }
  }

  const curlMatch = effective.match(/curl\s+.*?(https?:\/\/\S+)/)
  if (curlMatch) {
    try {
      const url = new URL(curlMatch[1])
      return { label: 'Fetched URL', target: url.hostname + url.pathname.slice(0, 30) }
    } catch {
      return { label: 'Fetched URL' }
    }
  }

  if (/^ls\b/.test(effective)) {
    const lsPath = effective.replace(/^ls\s*(-\S+\s+)*/, '').trim()
    if (lsPath) return { label: 'Listed files', target: basename(stripWorkspacePath(lsPath)) }
    return { label: 'Listed files' }
  }

  if (effective.includes(' | ')) {
    const firstCmd = effective.split(' | ')[0].trim()
    const truncated = firstCmd.length > 50 ? firstCmd.slice(0, 47) + '...' : firstCmd
    return { label: 'Executed action', target: truncated + ' | ...' }
  }

  if (effective.length > 80) {
    return { label: 'Executed action', target: effective.slice(0, 77) + '...' }
  }
  return { label: 'Executed action', target: effective }
}

export function formatToolDisplay(
  toolName: string,
  args?: Record<string, unknown>,
): ToolDisplay {
  const name = toolName.toLowerCase()

  if (!args || Object.keys(args).length === 0) {
    return { label: TOOL_LABELS[name] ?? toolName }
  }

  // Bash / shell
  if (name === 'bash' || name === 'exec' || name === 'shell' || name === 'powershell') {
    const cmd = getString(args, 'command')
    if (cmd) return formatBash(cmd)
    return { label: 'Executed action' }
  }

  // Read
  if (name === 'read') {
    const path = getString(args, 'file_path', 'path')
    if (path) {
      const fp = formatFilePath(path)
      return { label: 'Read file', target: fp.file, detail: fp.relative }
    }
    return { label: 'Read file' }
  }

  // Write
  if (name === 'write') {
    const path = getString(args, 'file_path', 'path')
    if (path) {
      const fp = formatFilePath(path)
      return { label: 'Wrote file', target: fp.file, detail: fp.relative }
    }
    return { label: 'Wrote file' }
  }

  // Edit / MultiEdit
  if (name === 'edit' || name === 'multiedit') {
    const path = getString(args, 'file_path', 'path')
    if (path) {
      const fp = formatFilePath(path)
      return { label: 'Edited file', target: fp.file, detail: fp.relative }
    }
    return { label: 'Edited file' }
  }

  // Glob
  if (name === 'glob') {
    const pattern = getString(args, 'pattern')
    if (pattern) return { label: 'Searched files', target: pattern }
    return { label: 'Searched files' }
  }

  // Grep
  if (name === 'grep') {
    const pattern = getString(args, 'pattern')
    const path = getString(args, 'path')
    if (pattern && path) {
      return { label: 'Searched codebase', target: `"${pattern}"`, detail: `in ${basename(stripWorkspacePath(path))}` }
    }
    if (pattern) return { label: 'Searched codebase', target: `"${pattern}"` }
    return { label: 'Searched codebase' }
  }

  // WebFetch
  if (name === 'webfetch') {
    const url = getString(args, 'url')
    if (url) {
      try {
        const parsed = new URL(url)
        return { label: 'Fetched page', target: parsed.hostname }
      } catch {
        return { label: 'Fetched page', target: url.slice(0, 60) }
      }
    }
    return { label: 'Fetched page' }
  }

  // WebSearch
  if (name === 'websearch') {
    const query = getString(args, 'query', 'q')
    if (query) return { label: 'Web search', target: `"${query}"` }
    return { label: 'Web search' }
  }

  // Agent / Task
  if (name === 'agent' || name === 'task') {
    const agentName = getString(args, 'name', 'subagent_type', 'agent_type')
    const desc = getString(args, 'description')
    const prompt = getString(args, 'prompt')
    const detail = desc || (prompt && prompt.length > 60 ? prompt.slice(0, 57) + '...' : prompt)
    if (agentName && detail) return { label: 'Delegated to agent', target: agentName, detail }
    if (agentName) return { label: 'Delegated to agent', target: agentName }
    if (detail) return { label: 'Started task', target: detail }
    return { label: 'Delegated to agent' }
  }

  // Skill
  if (name === 'skill') {
    const skillName = getString(args, 'skill', 'name')
    if (skillName) return { label: 'Invoked skill', target: `/${skillName}` }
    return { label: 'Invoked skill' }
  }

  // TodoWrite
  if (name === 'todowrite') {
    const todos = args.todos
    if (Array.isArray(todos) && todos.length > 0) {
      const count = todos.length
      return { label: 'Updated task list', target: `${count} ${count === 1 ? 'todo' : 'todos'}` }
    }
    const desc = getString(args, 'description', 'name', 'task')
    if (desc) {
      const short = desc.length > 60 ? desc.slice(0, 57) + '...' : desc
      return { label: 'Updated task list', target: short }
    }
    return { label: 'Updated task list' }
  }

  // TaskCreate
  if (name === 'taskcreate') {
    const desc = getString(args, 'description', 'name', 'task', 'prompt')
    if (desc) {
      const short = desc.length > 60 ? desc.slice(0, 57) + '...' : desc
      return { label: 'Created task', target: short }
    }
    return { label: 'Created task' }
  }

  // AskUserQuestion
  if (name === 'askuserquestion') {
    const question = getString(args, 'question', 'text', 'message')
    if (question) {
      const short = question.length > 60 ? question.slice(0, 57) + '...' : question
      return { label: 'Asked a question', target: short }
    }
    return { label: 'Asked a question' }
  }

  // Notebook
  if (name.includes('notebook')) {
    const path = getString(args, 'file_path', 'path', 'notebook')
    if (path) {
      const fp = formatFilePath(path)
      return { label: name.includes('edit') ? 'Edited notebook' : 'Read notebook', target: fp.file, detail: fp.relative }
    }
    return { label: 'Notebook operation' }
  }

  // ToolSearch
  if (name === 'toolsearch') {
    const query = getString(args, 'query')
    if (query) return { label: 'Searched tools', target: query }
    return { label: 'Searched tools' }
  }

  // Fallback
  for (const key of ['file_path', 'path', 'command', 'query', 'pattern', 'name', 'description', 'url']) {
    const val = args[key]
    if (typeof val === 'string' && val) {
      if (key === 'file_path' || key === 'path') {
        const fp = formatFilePath(val)
        return { label: toolName, target: fp.file, detail: fp.relative }
      }
      const short = val.length > 70 ? val.slice(0, 67) + '...' : val
      return { label: toolName, target: short }
    }
  }

  return { label: TOOL_LABELS[name] ?? toolName }
}

const TOOL_LABELS: Record<string, string> = {
  bash: 'Executed action',
  read: 'Read file',
  write: 'Wrote file',
  edit: 'Edited file',
  multiedit: 'Edited file',
  glob: 'Searched files',
  grep: 'Searched codebase',
  webfetch: 'Fetched page',
  websearch: 'Web search',
  agent: 'Delegated to agent',
  task: 'Started task',
  skill: 'Invoked skill',
  todowrite: 'Updated task list',
  taskcreate: 'Created task',
  askuserquestion: 'Asked a question',
  toolsearch: 'Searched tools',
  powershell: 'Executed action',
  exec: 'Executed action',
  shell: 'Executed action',
}
