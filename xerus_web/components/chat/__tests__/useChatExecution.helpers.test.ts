import { describe, it, expect } from 'vitest'
import {
  fileExtension,
  normalizeSandboxPath,
  VIEWABLE_EXTS,
  WRITE_TOOLS,
  modelContextSize,
} from '../useChatExecution.helpers'

describe('fileExtension', () => {
  it('returns extension with dot prefix', () => {
    expect(fileExtension('/workspace/file.ts')).toBe('.ts')
    expect(fileExtension('hello.py')).toBe('.py')
  })

  it('handles nested dots', () => {
    expect(fileExtension('app.config.ts')).toBe('.ts')
    expect(fileExtension('file.test.tsx')).toBe('.tsx')
  })

  it('returns empty string for files without extension', () => {
    expect(fileExtension('Dockerfile')).toBe('')
    expect(fileExtension('Makefile')).toBe('')
  })

  it('lowercases the extension', () => {
    expect(fileExtension('README.MD')).toBe('.md')
    expect(fileExtension('styles.CSS')).toBe('.css')
  })
})

describe('normalizeSandboxPath', () => {
  it('strips /home/daytona/workspace/ prefix', () => {
    expect(normalizeSandboxPath('/home/daytona/workspace/src/app.ts')).toBe('src/app.ts')
  })

  it('strips /workspaces/ prefix', () => {
    expect(normalizeSandboxPath('/workspaces/myproject/index.js')).toBe('myproject/index.js')
  })

  it('strips /home/user/ prefix', () => {
    expect(normalizeSandboxPath('/home/user/app/main.py')).toBe('app/main.py')
  })

  it('strips leading slash for unknown absolute paths', () => {
    expect(normalizeSandboxPath('/opt/data/config.yaml')).toBe('opt/data/config.yaml')
  })

  it('returns relative paths unchanged', () => {
    expect(normalizeSandboxPath('src/components/Button.tsx')).toBe('src/components/Button.tsx')
  })
})

describe('VIEWABLE_EXTS', () => {
  it('includes all code extensions', () => {
    const codeExts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.rb', '.go', '.rs', '.java']
    for (const ext of codeExts) {
      expect(VIEWABLE_EXTS.has(ext)).toBe(true)
    }
  })

  it('includes config extensions', () => {
    const configExts = ['.yaml', '.yml', '.toml', '.cfg', '.ini', '.env', '.dockerfile']
    for (const ext of configExts) {
      expect(VIEWABLE_EXTS.has(ext)).toBe(true)
    }
  })

  it('includes web extensions', () => {
    const webExts = ['.html', '.htm', '.css', '.scss', '.svg', '.json']
    for (const ext of webExts) {
      expect(VIEWABLE_EXTS.has(ext)).toBe(true)
    }
  })
})

describe('WRITE_TOOLS', () => {
  it('contains all write tool names', () => {
    expect(WRITE_TOOLS.has('Write')).toBe(true)
    expect(WRITE_TOOLS.has('Edit')).toBe(true)
    expect(WRITE_TOOLS.has('MultiEdit')).toBe(true)
    expect(WRITE_TOOLS.has('write_file')).toBe(true)
    expect(WRITE_TOOLS.has('edit_file')).toBe(true)
  })

  it('does not contain read tools', () => {
    expect(WRITE_TOOLS.has('Read')).toBe(false)
    expect(WRITE_TOOLS.has('Grep')).toBe(false)
  })
})

describe('modelContextSize', () => {
  it('returns correct size for known models', () => {
    expect(modelContextSize('claude-opus-4')).toBe(200000)
    expect(modelContextSize('gpt-4o')).toBe(128000)
    expect(modelContextSize('gemini-1.5-pro')).toBe(2000000)
  })

  it('returns default for unknown models', () => {
    expect(modelContextSize('unknown-model')).toBe(200000)
  })

  it('returns default for undefined', () => {
    expect(modelContextSize(undefined)).toBe(200000)
  })
})
