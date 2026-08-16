"use client"

import { useCallback, useEffect, useState } from "react"
import { apiFetch } from "@/lib/api-client"
import { toUtcTimestamp } from "@/lib/date"
import type { MediaFile } from "@/components/admin/media-lightbox"
import { useStaleRequest } from "@/hooks/use-stale-request"
import { useDebouncedValue } from "@/hooks/use-debounced-value"

/**
 * Fetch / pagination / filter / search state for the admin media library.
 * Upload and delete stay in the page orchestrator.
 */
export function useMediaLibrary() {
  const [files, setFiles] = useState<MediaFile[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [pageSize, setPageSize] = useState(20)
  const [searchInput, setSearchInput] = useState("")
  // Debounced query — the fetch below keys on this, so typing only hits
  // the API after a pause. Page 1 is only forced when the trimmed query
  // actually changes, so a stale debounce can't override a page/pageSize/
  // date change made within the debounce window.
  const debouncedInput = useDebouncedValue(searchInput, 400)
  // Trimmed query is derived — no effect sync. When it changes, reset to
  // page 1 during render (React’s recommended “adjust state when a prop
  // changes” pattern) so a stale debounce can’t override a page jump.
  const searchQuery = debouncedInput.trim()
  const [prevSearchQuery, setPrevSearchQuery] = useState(searchQuery)
  if (searchQuery !== prevSearchQuery) {
    setPrevSearchQuery(searchQuery)
    setPage(1)
  }
  // API unreachable (static deployment, server error, network) — was
  // previously swallowed silently, leaving an empty library with no
  // explanation and a dead-feeling upload button. Boolean so the fetch
  // callback doesn't depend on `t` (whose identity changes every render
  // and would refetch on each keystroke).
  const [apiError, setApiError] = useState(false)
  // Stale-response guard: rapid page changes only let the newest fetch win.
  const { begin, isCurrent } = useStaleRequest()
  // Refetch indicator (page/filter changes) — distinct from `loading`,
  // which only covers the initial skeleton.
  const [refreshing, setRefreshing] = useState(false)

  const fetchMedia = useCallback(
    async (targetPage: number) => {
      const seq = begin()
      setRefreshing(true)
      try {
        const params = new URLSearchParams({
          page: String(targetPage),
          pageSize: String(pageSize),
        })
        const from = toUtcTimestamp(dateFrom, false)
        const to = toUtcTimestamp(dateTo, true)
        if (from) params.set("from", from)
        if (to) params.set("to", to)
        if (searchQuery) params.set("q", searchQuery)
        const res = await apiFetch(`/api/upload?${params}`)
        if (res.ok) {
          const data = await res.json()
          if (isCurrent(seq)) {
            setFiles(data.images || [])
            setTotal(data.total ?? 0)
            setTotalPages(data.totalPages ?? 1)
            setApiError(false)
          }
        } else if (isCurrent(seq)) {
          setApiError(true)
        }
      } catch {
        if (isCurrent(seq)) {
          setApiError(true)
        }
      } finally {
        if (isCurrent(seq)) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [dateFrom, dateTo, pageSize, searchQuery, begin, isCurrent]
  )

  useEffect(() => {
    fetchMedia(page) // eslint-disable-line react-hooks/set-state-in-effect
  }, [page, fetchMedia])

  // Filter/page-size changes reset to page 1 — the [page, fetchMedia]
  // effect above refetches on its own (fetchMedia's identity changes with
  // the filter values), so no manual fetch is needed here.
  function updateDateRange(range: { from: string; to: string }) {
    setDateFrom(range.from)
    setDateTo(range.to)
    setPage(1)
  }

  function clearDateFilter() {
    setDateFrom("")
    setDateTo("")
    setPage(1)
  }

  function changePageSize(next: number) {
    setPageSize(next)
    setPage(1)
  }

  return {
    files,
    loading,
    refreshing,
    page,
    setPage,
    total,
    totalPages,
    dateFrom,
    dateTo,
    pageSize,
    searchInput,
    setSearchInput,
    searchQuery,
    apiError,
    setApiError,
    fetchMedia,
    updateDateRange,
    clearDateFilter,
    changePageSize,
  }
}
