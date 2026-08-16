"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"

function useHeaderSlot(id: string) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setSlot(document.getElementById(id)) // eslint-disable-line react-hooks/set-state-in-effect -- one-time lookup of the header slot (document is unavailable during SSR)
  }, [id])

  return slot
}

/**
 * Renders a page's primary action(s) into the admin top header's action
 * slot (#admin-header-actions in admin/layout.tsx), keeping the button's
 * state colocated with the page component while the UI stays in the
 * sticky header. Renders nothing until mounted.
 */
export function HeaderActions({ children }: { children: React.ReactNode }) {
  const slot = useHeaderSlot("admin-header-actions")
  if (!slot) return null
  return createPortal(children, slot)
}

