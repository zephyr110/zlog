"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
} from "@/components/ui/pagination"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useT } from "@/components/layout/trans"

/** Compact window: 1 2 3 4 … 12 (start), 1 … 9 10 11 12 (end), else
 *  1 … page-1 page page+1 … 12 — never more than 7 chips. Module-level
 *  so the windowing math is unit-testable. */
function buildPaginationItems(
  page: number,
  pageCount: number
): (number | "ellipsis")[] {
  if (pageCount <= 5) {
    return Array.from({ length: pageCount }, (_, i) => i + 1)
  }
  if (page <= 3) {
    return [1, 2, 3, 4, "ellipsis", pageCount]
  }
  if (page >= pageCount - 2) {
    return [1, "ellipsis", pageCount - 3, pageCount - 2, pageCount - 1, pageCount]
  }
  return [1, "ellipsis", page - 1, page, page + 1, "ellipsis", pageCount]
}

/**
 * Shared admin pagination bar — extracted from the posts list page so the
 * media library (and any future admin list) can reuse it.
 *
 * Renders a page-size selector + "{total} {itemLabel} · Page {page}/{totalPages}"
 * on the left and prev / page-number / next controls on the right. Hidden
 * only for empty lists (total === 0); single-page lists still show the bar
 * so page-size can be changed.
 */
export function PaginationBar({
  page,
  totalPages,
  total,
  itemLabel,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  page: number
  totalPages: number
  total: number
  itemLabel: string
  /** Current page size — shown in the size selector. */
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
}) {
  const { t } = useT()
  // Empty lists can report totalPages = 0 — clamp so the summary and the
  // page chips always have a sane value.
  const pageCount = Math.max(1, totalPages)

  // Show whenever there is data so page-size controls stay reachable
  // even on a single page (media library often has few items).
  if (total <= 0) return null

  const paginationItems = buildPaginationItems(page, pageCount)

  // Pinned to the bottom of the admin content column: !mt-auto absorbs
  // leftover height when the list above doesn't flex-grow; sticky keeps
  // the bar reachable if the page itself scrolls. List pages should give
  // the table/grid flex-1 so free space fills the list — not a void
  // between list and bar. Negative margins bleed edge-to-edge within
  // the admin content column (p-4 md:p-8).
  //
  // Mobile must stay a single row — never wrap. The shared Pagination
  // primitive ships `w-full`, which used to stretch the nav and shove
  // the page-size select onto a second line; override with w-auto.
  return (
    <div className="sticky bottom-0 z-10 shrink-0 !mt-auto -mx-4 -mb-4 md:-mx-8 md:-mb-8 bg-background/85 backdrop-blur px-4 md:px-8 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm text-muted-foreground">
          <span className="sm:hidden">
            {total} · {page}/{pageCount}
          </span>
          <span className="hidden sm:inline">
            {total} {itemLabel} · {t("admin.page")} {page}/{pageCount}
          </span>
        </p>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <Pagination className="mx-0 w-auto">
            <PaginationContent>
              <PaginationItem>
                <PaginationLink
                  onClick={() => onPageChange(page - 1)}
                  disabled={page <= 1}
                  size="icon"
                  aria-label={t("admin.prev")}
                  className="sm:w-auto sm:gap-1 sm:px-2.5 sm:pl-2.5"
                >
                  <ChevronLeft className="size-4" />
                  {/* Icon-only below sm — the summary text already carries
                      "Page x/y", and 7 chips + labeled buttons can't fit a
                      phone viewport. */}
                  <span className="hidden sm:inline">{t("admin.prev")}</span>
                </PaginationLink>
              </PaginationItem>
              {paginationItems.map((item, index) =>
                item === "ellipsis" ? (
                  <PaginationItem
                    key={`ellipsis-${index}`}
                    className="hidden sm:list-item"
                  >
                    <PaginationEllipsis />
                  </PaginationItem>
                ) : (
                  <PaginationItem key={item} className="hidden sm:list-item">
                    <PaginationLink
                      isActive={page === item}
                      onClick={() => onPageChange(item)}
                    >
                      {item}
                    </PaginationLink>
                  </PaginationItem>
                )
              )}
              <PaginationItem>
                <PaginationLink
                  onClick={() => onPageChange(page + 1)}
                  disabled={page >= pageCount}
                  size="icon"
                  aria-label={t("admin.next")}
                  className="sm:w-auto sm:gap-1 sm:px-2.5 sm:pr-2.5"
                >
                  <span className="hidden sm:inline">{t("admin.next")}</span>
                  <ChevronRight className="size-4" />
                </PaginationLink>
              </PaginationItem>
            </PaginationContent>
          </Pagination>
          {onPageSizeChange && (
            <Select
              value={String(pageSize)}
              onValueChange={(v) => onPageSizeChange(Number(v))}
            >
              <SelectTrigger
                size="sm"
                aria-label={t("admin.pageSize")}
                className="h-7 w-auto gap-1 px-2 text-xs tabular-nums"
              >
                <SelectValue />
              </SelectTrigger>
              {/* w-fit + min-w-20: a bare-number menu shouldn't stretch to
                  the default 144px; tabular-nums keeps 20/40/60 aligned. */}
              <SelectContent align="end" className="w-fit min-w-20">
                {[20, 40, 60].map((size) => (
                  <SelectItem
                    key={size}
                    value={String(size)}
                    className="py-1.5 font-medium tabular-nums"
                  >
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>
    </div>
  )
}
