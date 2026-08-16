"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Clipboard copy with a transient "copied" state.
 * Falls back to a hidden textarea + execCommand for older browsers.
 * Returns true on success, false on failure.
 */
export function useCopyToClipboard(resetAfter = 2000) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null)

  // Clear any pending reset timer on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      let ok = false
      try {
        await navigator.clipboard.writeText(text)
        ok = true
      } catch {
        const textarea = document.createElement("textarea")
        textarea.value = text
        textarea.style.position = "fixed"
        textarea.style.opacity = "0"
        document.body.appendChild(textarea)
        textarea.select()
        try {
          ok = document.execCommand("copy")
        } catch {
          ok = false
        }
        document.body.removeChild(textarea)
      }

      if (ok) {
        setCopied(true)
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => setCopied(false), resetAfter)
      }
      return ok
    },
    [resetAfter]
  )

  return { copied, copy }
}
