/**
 * useInfiniteScroll — IntersectionObserver wrapper for pagination.
 *
 * Returns a ref that, when attached to a sentinel element, fires onLoadMore
 * when the sentinel scrolls into view. Caller is responsible for guarding
 * against duplicate loads via hasMore + isLoading.
 */
import { useEffect, useRef } from 'react'

interface Options {
  hasMore: boolean
  isLoading: boolean
  onLoadMore: () => void
  rootMargin?: string
  threshold?: number
}

export function useInfiniteScroll<T extends Element = HTMLDivElement>({
  hasMore,
  isLoading,
  onLoadMore,
  rootMargin = '200px',
  threshold = 0,
}: Options) {
  const sentinelRef = useRef<T | null>(null)
  const onLoadMoreRef = useRef(onLoadMore)
  onLoadMoreRef.current = onLoadMore

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasMore || isLoading) return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry?.isIntersecting) {
          onLoadMoreRef.current()
        }
      },
      { rootMargin, threshold },
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, isLoading, rootMargin, threshold])

  return sentinelRef
}
