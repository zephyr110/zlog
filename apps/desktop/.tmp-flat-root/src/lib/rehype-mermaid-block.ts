/* Pulls ```mermaid fenced blocks out of the rehype-pretty-code pipeline
   so the shared `pre` component can render them as live diagrams.

   rehype-pretty-code treats every `pre > code` as block code (with
   defaultLang "plaintext" it would highlight mermaid source as text and
   tag the pre data-language="plaintext", hiding the original language).
   This plugin instead moves the source into a `data-mermaid` attribute
   on the pre and empties its children — the pre no longer looks like
   block code, pretty-code skips it, and mdxComponents' `pre` handler
   checks for the attribute first. Runs in BOTH the public MDX pipeline
   and the admin editor preview. */

interface HastNode {
  type: string
  tagName?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
  value?: string
}

export function rehypeMermaidBlock() {
  return (tree: HastNode) => {
    walk(tree)
  }
}

function walk(node: HastNode): void {
  if (!node || typeof node !== "object" || !Array.isArray(node.children)) return

  for (const child of node.children) {
    if (child?.type !== "element") continue
    if (child.tagName === "pre") {
      const code = child.children?.find(
        (c) => c.type === "element" && c.tagName === "code"
      )
      const classes = Array.isArray(code?.properties?.className)
        ? code.properties.className
        : []
      if (code && classes.some((c) => c === "language-mermaid")) {
        const source =
          code.children?.map((c) => c.value ?? "").join("") ?? ""
        child.properties = child.properties ?? {}
        child.properties.dataMermaid = source
        child.children = []
        continue
      }
    }
    walk(child)
  }
}
