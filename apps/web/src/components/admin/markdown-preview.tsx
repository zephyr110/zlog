"use client"

import { useDeferredValue, useEffect, useState } from "react"
import { serialize } from "next-mdx-remote/serialize"
import { MDXRemote, type MDXRemoteSerializeResult } from "next-mdx-remote"
import remarkGfm from "remark-gfm"
import { mdxComponents } from "@/components/blog/mdx-components"
import { blogRehypePlugins } from "@/lib/mdx-pipeline"
import { useT } from "@/components/layout/trans"
import { cn } from "@/lib/utils"
import { POST_PROSE_CLASSES } from "@/lib/prose"
import { PreviewErrorBoundary } from "@/components/admin/preview-error-boundary"

interface MarkdownPreviewProps {
  content: string
}

type PreviewSource = MDXRemoteSerializeResult

/**
 * Admin editor preview — compiles with the same MDX + remark/rehype path as
 * the public post page (`MDXRenderer`), so JSX/HTML blocks like
 * `<details>/<summary>` wrapping fenced code match published output.
 */
export function MarkdownPreview({ content }: MarkdownPreviewProps) {
  const { t } = useT()
  // Deferred so typing stays responsive — serialize runs on the stale
  // content while the new text settles in the background.
  const deferredContent = useDeferredValue(content)
  const [source, setSource] = useState<PreviewSource | null>(null)
  const [compileError, setCompileError] = useState(false)
  const [compiling, setCompiling] = useState(false)

  useEffect(() => {
    const text = deferredContent.trim()
    if (!text) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset compile state when the deferred buffer clears
      setSource(null)
      setCompileError(false)
      setCompiling(false)
      return
    }

    let cancelled = false
    setCompiling(true)
    setCompileError(false)

    serialize(text, {
      parseFrontmatter: false,
      mdxOptions: {
        remarkPlugins: [remarkGfm],
        rehypePlugins: blogRehypePlugins,
      },
    })
      .then((result) => {
        if (cancelled) return
        setSource(result)
        setCompileError(false)
        setCompiling(false)
      })
      .catch(() => {
        if (cancelled) return
        // Keep the last good compile so transient MDX syntax errors while
        // typing don't blank the preview; only surface an error if we have
        // nothing to show yet.
        setCompileError(true)
        setCompiling(false)
      })

    return () => {
      cancelled = true
    }
  }, [deferredContent])

  return (
    <div
      className={cn(
        POST_PROSE_CLASSES,
        "min-h-[400px] lg:min-h-[calc(100vh-24rem)] border rounded-lg p-6 bg-card"
      )}
    >
      {!deferredContent.trim() ? (
        <p className="text-muted-foreground italic">
          {t("admin.previewEmpty")}
        </p>
      ) : source ? (
        <PreviewErrorBoundary
          resetKey={source.compiledSource}
          fallback={
            <p className="text-muted-foreground italic">
              {t("admin.previewError")}
            </p>
          }
        >
          <MDXRemote {...source} components={mdxComponents} />
        </PreviewErrorBoundary>
      ) : compileError ? (
        <p className="text-muted-foreground italic">
          {t("admin.previewError")}
        </p>
      ) : compiling ? (
        <p className="text-muted-foreground italic">
          {t("admin.previewRendering")}
        </p>
      ) : null}
    </div>
  )
}
