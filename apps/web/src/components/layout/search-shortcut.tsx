"use client"

import { useEffect } from "react"

/**
 * GitHub-style "/" shortcut: focus the first visible search box.
 * A page-level box (archive, admin) wins over the header one — those filter
 * in place, while the header box only redirects to /archive.
 */
export function SearchShortcut() {
  useEffect(() => {
    function isEditable(el: Element | null): boolean {
      if (!(el instanceof HTMLElement)) return false
      const tag = el.tagName
      return (
        el.isContentEditable ||
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT"
      )
    }

    function onKeyDown(e: KeyboardEvent) {
      // Leave modified chords alone (browser/OS shortcuts) and never steal
      // "/" from an IME composition — some layouts use it while composing.
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.isComposing || e.defaultPrevented) return
      if (isEditable(e.target as Element | null)) return
      // Background under a modal is only aria-hidden, not inert, so it is
      // still focusable; taking focus there would escape the dialog.
      if (
        document.querySelector(
          '[data-slot="dialog-content"], [aria-modal="true"]'
        )
      ) {
        return
      }

      const inputs = Array.from(
        document.querySelectorAll<HTMLInputElement>("input[data-search-input]")
      ).filter((el) => el.getClientRects().length > 0)
      const target =
        inputs.find((el) => el.dataset.searchInput === "page") ?? inputs[0]
      // No search box in this layout (e.g. mobile header) — let "/" type.
      if (!target) return

      e.preventDefault()
      target.focus()
      // Caret to the end so existing queries stay editable in place.
      const end = target.value.length
      target.setSelectionRange(end, end)
    }

    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  return null
}
