import { useState, useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { apiCall } from '@/lib/api/client'
import { getTool, getToolsCatalog } from '@/lib/api/tools'
import { Tool } from '@/types/tool'
import { mapToolData } from '@/utils/tools'

interface ConnectedAccount {
  app: { name_slug: string }
  id: string
  healthy?: boolean
  dead?: boolean
}

interface ConnectedAccountInfo {
  slugs: Set<string>
  accounts: ConnectedAccount[]
}

interface ToolCatalogData {
  tools: Tool[]
  pagination: {
    total: number
    page: number
    limit: number
    total_pages: number
    has_more: boolean
  }
  categories: string[]
}

async function fetchConnectedAccounts(appSlug?: string): Promise<ConnectedAccountInfo> {
  const query = appSlug ? `?app=${encodeURIComponent(appSlug)}` : ''
  const response = await apiCall(`/tools/accounts${query}`, { method: 'GET' }, false)
  const result = await response.json()
  const allAccounts = result.data || result || []
  const healthy = allAccounts.filter((acc: ConnectedAccount) => acc.healthy !== false && !acc.dead)
  return {
    slugs: new Set(healthy.map((acc: ConnectedAccount) => acc.app.name_slug)),
    accounts: healthy,
  }
}

function enrichTools(toolsData: Record<string, unknown>[], accountInfo: ConnectedAccountInfo): Tool[] {
  return toolsData.map((toolData: Record<string, unknown>) => {
    const tool = mapToolData(toolData)
    const appSlug = tool.tool_name || tool.id
    const toolAccounts = accountInfo.accounts.filter((account) => account.app.name_slug === appSlug)
    return {
      ...tool,
      is_configured: toolAccounts.length > 0,
      auth_status_checked: true,
      connected_account_ids: toolAccounts.map((account) => account.id),
    }
  })
}

async function fetchCatalog(params: {
  page: number
  limit: number
  searchQuery: string
  selectedCategories: string[]
}): Promise<ToolCatalogData> {
  const [catalog, accountInfo] = await Promise.all([
    getToolsCatalog({
      page: params.page,
      limit: params.limit,
      search: params.searchQuery,
      categories: params.selectedCategories,
    }),
    fetchConnectedAccounts(),
  ])

  return {
    tools: enrichTools(catalog.apps, accountInfo),
    pagination: catalog.pagination,
    categories: catalog.available_categories,
  }
}

async function fetchToolBySlug(toolSlug: string): Promise<Tool> {
  const [toolData, accountInfo] = await Promise.all([
    getTool(toolSlug),
    fetchConnectedAccounts(toolSlug),
  ])
  if (!toolData) {
    throw new Error(`Tool not found: ${toolSlug}`)
  }
  return enrichTools([toolData], accountInfo)[0]
}

// Bounded concurrency map — keeps the request burst small enough for the
// backend rate limiter even when a workspace has dozens of tools to look up.
const TOOL_LOOKUP_CONCURRENCY = 5

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  if (items.length === 0) return []
  const results: PromiseSettledResult<R>[] = new Array(items.length)
  let cursor = 0

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++
      if (index >= items.length) return
      try {
        results[index] = { status: 'fulfilled', value: await worker(items[index]) }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  })

  await Promise.all(runners)
  return results
}

async function fetchToolsBySlugs(toolSlugs: string[], accountInfo?: ConnectedAccountInfo): Promise<Tool[]> {
  const uniqueSlugs = Array.from(new Set(toolSlugs.filter(Boolean)))
  if (uniqueSlugs.length === 0) {
    return []
  }

  const resolvedAccountInfo = accountInfo ?? await fetchConnectedAccounts()
  const results = await mapWithConcurrency(uniqueSlugs, TOOL_LOOKUP_CONCURRENCY, (toolSlug) => getTool(toolSlug))
  const toolsData = results
    .filter((result): result is PromiseFulfilledResult<Record<string, unknown> | null> => result.status === 'fulfilled')
    .map((result) => result.value)
    .filter((value): value is Record<string, unknown> => value !== null)
  return enrichTools(toolsData, resolvedAccountInfo)
}

export function useToolCatalog(limit: number = 24) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [page, setPage] = useState(1)

  // Memoise so the SWR key reference is stable across renders that don't change selection.
  const sortedCategories = useMemo(
    () => [...selectedCategories].sort(),
    [selectedCategories],
  )

  const { data, isLoading, error: swrError, mutate } = useSWR(
    ['tool-catalog', page, limit, searchQuery, sortedCategories],
    ([, currentPage, currentLimit, currentSearch, currentCategories]) =>
      fetchCatalog({
        page: currentPage as number,
        limit: currentLimit as number,
        searchQuery: currentSearch as string,
        selectedCategories: currentCategories as string[],
      })
  )

  const updateSearch = useCallback((search: string) => {
    setSearchQuery(search)
    setPage(1)
  }, [])

  const toggleCategory = useCallback((category: string) => {
    setSelectedCategories((prev) => {
      const next = prev.includes(category)
        ? prev.filter((value) => value !== category)
        : [...prev, category]
      return next
    })
    setPage(1)
  }, [])

  const setCategories = useCallback((categories: string[]) => {
    setSelectedCategories(categories)
    setPage(1)
  }, [])

  const clearCategories = useCallback(() => {
    setSelectedCategories([])
    setPage(1)
  }, [])

  const refetch = useCallback(() => {
    mutate()
  }, [mutate])

  return {
    tools: data?.tools ?? [],
    loading: isLoading,
    error: swrError ? (swrError instanceof Error ? swrError.message : 'Failed to fetch tools') : null,
    refetch,
    searchQuery,
    selectedCategories,
    updateSearch,
    toggleCategory,
    setCategories,
    clearCategories,
    totalTools: data?.pagination.total ?? 0,
    categories: data?.categories ?? [],
    page,
    totalPages: data?.pagination.total_pages ?? 1,
    hasMore: data?.pagination.has_more ?? false,
    setPage,
  }
}

export function useSearchableTools(searchQuery: string, limit: number = 100) {
  const { data, isLoading, error: swrError, mutate } = useSWR(
    ['tool-search', searchQuery, limit],
    ([, currentSearch, currentLimit]) =>
      fetchCatalog({
        page: 1,
        limit: currentLimit as number,
        searchQuery: currentSearch as string,
        selectedCategories: [],
      })
  )

  const refetch = useCallback(() => {
    mutate()
  }, [mutate])

  return {
    tools: data?.tools ?? [],
    loading: isLoading,
    error: swrError ? (swrError instanceof Error ? swrError.message : 'Failed to fetch tools') : null,
    refetch,
    totalTools: data?.pagination.total ?? 0,
    hasMore: data?.pagination.has_more ?? false,
  }
}

export function useTool(toolSlug?: string) {
  const decodedToolSlug = toolSlug ? decodeURIComponent(toolSlug) : null
  const { data, isLoading, error: swrError, mutate } = useSWR(
    decodedToolSlug ? ['tool', decodedToolSlug] : null,
    ([, slug]) => fetchToolBySlug(slug as string)
  )

  const refetch = useCallback(() => {
    mutate()
  }, [mutate])

  return {
    tool: data ?? null,
    loading: isLoading,
    error: swrError ? (swrError instanceof Error ? swrError.message : 'Failed to fetch tool') : null,
    refetch,
  }
}

export function useToolLookup(toolSlugs: string[]) {
  const normalizedSlugs = useMemo(
    () => Array.from(new Set(toolSlugs.filter(Boolean))).sort(),
    [toolSlugs]
  )

  const { data, isLoading, error: swrError, mutate } = useSWR(
    normalizedSlugs.length > 0 ? ['tool-lookup', normalizedSlugs] : null,
    () => fetchToolsBySlugs(normalizedSlugs)
  )

  const refetch = useCallback(() => {
    mutate()
  }, [mutate])

  return {
    tools: data ?? [],
    loading: isLoading,
    error: swrError ? (swrError instanceof Error ? swrError.message : 'Failed to fetch tools') : null,
    refetch,
  }
}

export function useConnectedTools() {
  const { data, isLoading, error: swrError, mutate } = useSWR(
    'connected-tools',
    async () => {
      const accountInfo = await fetchConnectedAccounts()
      const tools = await fetchToolsBySlugs(Array.from(accountInfo.slugs), accountInfo)
      return tools
    }
  )

  const refetch = useCallback(() => {
    mutate()
  }, [mutate])

  return {
    tools: data ?? [],
    loading: isLoading,
    error: swrError ? (swrError instanceof Error ? swrError.message : 'Failed to fetch tools') : null,
    refetch,
  }
}
