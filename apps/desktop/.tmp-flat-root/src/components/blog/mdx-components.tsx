/* Shared MDX/markdown component map.

   Single source of truth for how article content renders (headings,
   paragraphs, links, images, blockquotes, code blocks, tables…), used by:
   - the public post page's MDXRenderer (next-mdx-remote/rsc)
   - the admin post editor's preview (next-mdx-remote serialize + MDXRemote)

   Keeping one map means the editor preview stays visually faithful to the
   published post. */

import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react"
import { ChevronRight } from "lucide-react"
import { CodeBlock } from "@/components/blog/code-block"
import { HeadingLink } from "@/components/blog/heading-link"
import { Mermaid } from "@/components/blog/mermaid"
import { VideoEmbed } from "@/components/blog/video-embed"
import { parseVideoEmbed } from "@/lib/video-embed"
import { cn } from "@/lib/utils"

function childText(node: ReactNode): string {
  return Children.toArray(node)
    .map((c) => {
      if (typeof c === "string" || typeof c === "number") return String(c)
      if (isValidElement<{ children?: ReactNode }>(c)) {
        return childText(c.props.children)
      }
      return ""
    })
    .join("")
}

/** Paragraph that is only a Bilibili/YouTube link → embed instead of <p>. */
function standaloneVideoFromChildren(children: ReactNode) {
  const meaningful = Children.toArray(children).filter((child) => {
    if (typeof child === "string") return child.trim().length > 0
    return true
  })
  if (meaningful.length !== 1) return null
  const only = meaningful[0]
  if (!isValidElement(only)) return null
  const href = (only.props as { href?: string }).href
  if (!href) return null
  // A linked image ([![cover](img.png)](https://youtu.be/…)) must stay a
  // link — converting it would silently drop the thumbnail. Only anchors
  // whose content is plain text become embeds.
  const anchorChildren = (only as ReactElement<{ children?: ReactNode }>).props
    .children
  if (Children.toArray(anchorChildren).some((c) => isValidElement(c))) {
    return null
  }
  const parsed = parseVideoEmbed(href)
  if (!parsed) return null
  const title = childText(anchorChildren)
  return { ...parsed, title: title || undefined }
}

export const mdxComponents = {
  // Headings with anchor links
  h1: ({ children, id, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <HeadingLink as="h1" id={id} {...props}>
      {children}
    </HeadingLink>
  ),
  h2: ({ children, id, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <HeadingLink as="h2" id={id} {...props}>
      {children}
    </HeadingLink>
  ),
  h3: ({ children, id, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <HeadingLink as="h3" id={id} {...props}>
      {children}
    </HeadingLink>
  ),

  // Paragraphs — a sole Bilibili/YouTube link becomes a block embed
  // (never nest the iframe inside <p>).
  p: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => {
    const video = standaloneVideoFromChildren(children)
    if (video) {
      return (
        <VideoEmbed
          provider={video.provider}
          id={video.id}
          title={video.title}
        />
      )
    }
    return (
      <p className="my-5 leading-7 text-foreground/90" {...props}>
        {children}
      </p>
    )
  },


  // Links - external opens in new tab
  a: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
    const isExternal = href?.startsWith("http") ?? false
    return (
      <a
        href={href}
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noopener noreferrer" : undefined}
        className="font-medium underline decoration-primary/40 underline-offset-3 hover:decoration-primary hover:text-primary transition-all"
        {...props}
      >
        {children}
      </a>
    )
  },

  // Images — keep inline-compatible to avoid invalid nesting inside <p>
  img: ({ src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt || ""}
      className="rounded-xl shadow-lg border border-border/60"
      loading="lazy"
      {...props}
    />
  ),

  // Blockquotes - styled with accent border and background
  blockquote: ({ children, ...props }: React.BlockquoteHTMLAttributes<HTMLQuoteElement>) => (
    <blockquote
      className="relative my-6 pl-5 pr-4 py-3 border-l-[3px] border-primary/50 bg-muted/30 rounded-r-lg not-italic"
      {...props}
    >
      <span className="absolute left-2 top-2 text-primary/20 text-4xl leading-none font-serif select-none">&ldquo;</span>
      <div className="relative text-muted-foreground leading-7">
        {children}
      </div>
    </blockquote>
  ),

  // Code blocks — mermaid diagrams (flagged with data-mermaid by the
  // rehype-mermaid-block plugin) render as live SVG diagrams; everything
  // else gets the CodeBlock chrome (header, copy button, line numbers).
  // `!== undefined` (not truthiness): an EMPTY fence still carries
  // data-mermaid="" and must reach Mermaid, which shows a neutral
  // placeholder instead of the plugin's children-less CodeBlock.
  pre: ({
    "data-mermaid": dataMermaid,
    ...props
  }: React.ComponentProps<"pre"> & { "data-mermaid"?: string }) => {
    if (dataMermaid !== undefined) return <Mermaid code={dataMermaid} />
    return <CodeBlock {...props} />
  },

  // Inline code
  code: ({
    className,
    children,
    ...props
  }: React.HTMLAttributes<HTMLElement>) => {
    // Block vs inline: pretty-code stamps data-language on the code inside
    // every fence (even bare fences, via the pipeline's defaultLang
    // "plaintext"), while bypassInlineCode keeps backtick spans
    // attribute-free — so data-language presence is the discriminator. The
    // className half guards raw MDX `<code className="language-x">`.
    const isInline = !className?.includes("language-") &&
      !(props as Record<string, unknown>)["data-language"]
    if (isInline) {
      return (
        <code
          className="relative rounded-md bg-muted px-[0.35rem] py-[0.15rem] font-mono text-[0.875em] font-medium text-primary/90 dark:text-primary/80 break-words"
          {...props}
        >
          {children}
        </code>
      )
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    )
  },

  // Strong and emphasis
  strong: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
    <strong className="font-semibold text-foreground" {...props}>
      {children}
    </strong>
  ),
  em: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
    <em className="italic text-foreground/90" {...props}>
      {children}
    </em>
  ),

  // Tables - clean, minimal with hover rows
  table: ({ children, ...props }: React.TableHTMLAttributes<HTMLTableElement>) => (
    <div className="overflow-x-auto my-8 rounded-xl border border-border/60 shadow-sm">
      <table className="w-full text-sm" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
    <thead className="bg-muted/60 border-b" {...props}>
      {children}
    </thead>
  ),
  th: ({ children, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider" {...props}>
      {children}
    </th>
  ),
  tbody: ({ children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
    <tbody className="divide-y" {...props}>
      {children}
    </tbody>
  ),
  tr: ({ children, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
    <tr className="transition-colors hover:bg-muted/30" {...props}>
      {children}
    </tr>
  ),
  td: ({ children, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
    <td className="px-4 py-3 align-middle" {...props}>
      {children}
    </td>
  ),

  // Keyboard input
  kbd: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
    <kbd
      className="inline-flex items-center rounded-md border border-b-2 bg-muted px-1.5 py-0.5 font-mono text-xs font-medium text-muted-foreground shadow-[0_1px_1px_rgb(0,0,0,0.08)]"
      {...props}
    >
      {children}
    </kbd>
  ),

  // Horizontal rule
  hr: (props: React.HTMLAttributes<HTMLHRElement>) => (
    <hr className="my-10 border-t border-dashed border-border/80" {...props} />
  ),

  // Collapsible blocks (`<details>/<summary>` in MDX) — same chrome on
  // public posts and admin preview; native open/close interaction.
  details: ({
    children,
    className,
    ...props
  }: React.DetailsHTMLAttributes<HTMLDetailsElement>) => (
    <details
      className={cn(
        "group my-6 rounded-xl border border-border/60 bg-muted/20 px-4 py-1 open:pb-4",
        className
      )}
      {...props}
    >
      {children}
    </details>
  ),
  summary: ({
    children,
    className,
    ...props
  }: React.HTMLAttributes<HTMLElement>) => (
    <summary
      className={cn(
        "flex cursor-pointer list-none items-center gap-2 py-3 font-medium text-foreground select-none",
        "marker:content-none [&::-webkit-details-marker]:hidden",
        className
      )}
      {...props}
    >
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
        aria-hidden
      />
      <span className="min-w-0 flex-1">{children}</span>
    </summary>
  ),

  // Unordered list
  ul: ({ children, ...props }: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="my-5 space-y-2 list-disc pl-6 marker:text-primary/60" {...props}>
      {children}
    </ul>
  ),

  // Ordered list
  ol: ({ children, ...props }: React.HTMLAttributes<HTMLOListElement>) => (
    <ol className="my-5 space-y-2 list-decimal pl-6 marker:text-muted-foreground/70" {...props}>
      {children}
    </ol>
  ),

  // List item with better nested spacing
  li: ({ children, ...props }: React.HTMLAttributes<HTMLLIElement>) => (
    <li className="pl-1 leading-7" {...props}>
      {children}
    </li>
  ),
}
