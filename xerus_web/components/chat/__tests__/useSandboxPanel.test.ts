import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSandboxPanel } from '../useSandboxPanel'

// Mock the workspace API
vi.mock('@/lib/api/workspace', () => ({
  startBrowser: vi.fn(),
  startTerminal: vi.fn(),
}))

// Mock toast
vi.mock('@/lib/toast', () => ({
  toast: {
    error: vi.fn(),
  },
}))

import { startBrowser, startTerminal } from '@/lib/api/workspace'
import { toast } from '@/lib/toast'

const mockStartBrowser = startBrowser as ReturnType<typeof vi.fn>
const mockStartTerminal = startTerminal as ReturnType<typeof vi.fn>
const mockToastError = toast.error as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useSandboxPanel', () => {
  it('initial state: all URLs null, not loading', () => {
    const { result } = renderHook(() => useSandboxPanel())

    expect(result.current.browserUrl).toBeNull()
    expect(result.current.terminalUrl).toBeNull()
    expect(result.current.isBrowserLoading).toBe(false)
    expect(result.current.isTerminalLoading).toBe(false)
    expect(result.current.sandboxTab).toBe('terminal')
  })

  it('openBrowser sets loading then URL on success', async () => {
    mockStartBrowser.mockResolvedValue({ novnc_url: 'https://browser.example.com' })

    const { result } = renderHook(() => useSandboxPanel())

    await act(async () => {
      await result.current.openBrowser()
    })

    expect(result.current.browserUrl).toBe('https://browser.example.com')
    expect(result.current.isBrowserLoading).toBe(false)
    expect(result.current.sandboxTab).toBe('browser')
    expect(mockStartBrowser).toHaveBeenCalledTimes(1)
  })

  it('openBrowser shows toast on failure', async () => {
    mockStartBrowser.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useSandboxPanel())

    await act(async () => {
      await result.current.openBrowser()
    })

    expect(result.current.browserUrl).toBeNull()
    expect(result.current.isBrowserLoading).toBe(false)
    expect(mockToastError).toHaveBeenCalledWith(
      "Couldn't open the browser preview",
      { description: 'Your workspace may still be starting up.' },
    )
  })

  it('openTerminal sets loading then URL on success', async () => {
    mockStartTerminal.mockResolvedValue({ terminal_url: 'https://terminal.example.com' })

    const { result } = renderHook(() => useSandboxPanel())

    await act(async () => {
      await result.current.openTerminal()
    })

    expect(result.current.terminalUrl).toBe('https://terminal.example.com')
    expect(result.current.isTerminalLoading).toBe(false)
    expect(result.current.sandboxTab).toBe('terminal')
    expect(mockStartTerminal).toHaveBeenCalledTimes(1)
  })

  it('openTerminal shows toast on failure', async () => {
    mockStartTerminal.mockRejectedValue(new Error('Timeout'))

    const { result } = renderHook(() => useSandboxPanel())

    await act(async () => {
      await result.current.openTerminal()
    })

    expect(result.current.terminalUrl).toBeNull()
    expect(result.current.isTerminalLoading).toBe(false)
    expect(mockToastError).toHaveBeenCalledWith(
      "Couldn't open the terminal",
      { description: 'Your workspace may still be starting up.' },
    )
  })

  it('closePanel resets both URLs to null', async () => {
    mockStartBrowser.mockResolvedValue({ novnc_url: 'https://browser.example.com' })
    mockStartTerminal.mockResolvedValue({ terminal_url: 'https://terminal.example.com' })

    const { result } = renderHook(() => useSandboxPanel())

    // Open both
    await act(async () => {
      await result.current.openBrowser()
    })
    await act(async () => {
      await result.current.openTerminal()
    })

    expect(result.current.browserUrl).toBe('https://browser.example.com')
    expect(result.current.terminalUrl).toBe('https://terminal.example.com')

    // Close
    act(() => {
      result.current.closePanel()
    })

    expect(result.current.browserUrl).toBeNull()
    expect(result.current.terminalUrl).toBeNull()
  })

  it('does not re-open browser if already open', async () => {
    mockStartBrowser.mockResolvedValue({ novnc_url: 'https://browser.example.com' })

    const { result } = renderHook(() => useSandboxPanel())

    // Open browser
    await act(async () => {
      await result.current.openBrowser()
    })

    expect(mockStartBrowser).toHaveBeenCalledTimes(1)

    // Try to open again
    await act(async () => {
      await result.current.openBrowser()
    })

    // Should not call API again
    expect(mockStartBrowser).toHaveBeenCalledTimes(1)
  })

  it('does not re-open terminal if already open', async () => {
    mockStartTerminal.mockResolvedValue({ terminal_url: 'https://terminal.example.com' })

    const { result } = renderHook(() => useSandboxPanel())

    // Open terminal
    await act(async () => {
      await result.current.openTerminal()
    })

    expect(mockStartTerminal).toHaveBeenCalledTimes(1)

    // Try to open again
    await act(async () => {
      await result.current.openTerminal()
    })

    // Should not call API again
    expect(mockStartTerminal).toHaveBeenCalledTimes(1)
  })
})
