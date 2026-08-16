"use client"

import { Component, type ReactNode } from "react"

/**
 * MDXRemote / highlight failures throw at render time — without a
 * boundary that would unmount the whole editor. The resetKey (the
 * deferred content) clears the error on the next keystroke so the
 * preview retries, without remounting on every keypress.
 */
export class PreviewErrorBoundary extends Component<
  { resetKey: string; fallback: ReactNode; children: ReactNode },
  { hasError: boolean; lastKey: string }
> {
  state = { hasError: false, lastKey: "" }
  static getDerivedStateFromProps(
    props: { resetKey: string },
    state: { hasError: boolean; lastKey: string }
  ) {
    return state.lastKey !== props.resetKey
      ? { hasError: false, lastKey: props.resetKey }
      : null
  }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children
  }
}
