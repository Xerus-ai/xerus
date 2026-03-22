import { useState, useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { apiCall } from '@/lib/api'
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

function enrichTools(toolsData: any[], accountInfo: ConnectedAccountInfo): Tool[] {
  return toolsData.map((toolData: any) => {
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
  return enrichTools([toolData], accountInfo)[0]
}

async function fetchToolsBySlugs(toolSlugs: string[], accountInfo?: ConnectedAccountInfo): Promise<Tool[]> {
  const uniqueSlugs = Array.from(new Set(toolSlugs.filter(Boolean)))
  if (uniqueSlugs.length === 0) {
    return []
  }

  const resolvedAccountInfo = accountInfo ?? await fetchConnectedAccounts()
  const results = await Promise.allSettled(uniqueSlugs.map((toolSlug) => getTool(toolSlug)))
  const toolsData = results
    .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
    .map((result) => result.value)
  return enrichTools(toolsData, resolvedAccountInfo)
}

export function useToolCatalog(limit: number = 24) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [page, setPage] = useState(1)

  const { data, isLoading, error: swrError, mutate } = useSWR(
    ['tool-catalog', page, limit, searchQuery, selectedCategories.join(',')],
    ([, currentPage, currentLimit, currentSearch, currentCategories]) =>
      fetchCatalog({
        page: currentPage as number,
        limit: currentLimit as number,
        searchQuery: currentSearch as string,
        selectedCategories: currentCategories ? String(currentCategories).split(',').filter(Boolean) : [],
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
    normalizedSlugs.length > 0 ? ['tool-lookup', normalizedSlugs.join(',')] : null,
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
