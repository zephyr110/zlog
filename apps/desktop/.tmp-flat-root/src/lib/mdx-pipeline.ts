/* Shared rehype pipeline for article content — the ONE place that
   encodes plugin order. Consumed by the public post page (MDXRenderer,
   next-mdx-remote/rsc) and the admin editor preview (serialize +
   MDXRemote on the client), so both surfaces render identically.

   Order matters: rehypeMermaidBlock must run BEFORE rehype-pretty-code
   (it empties mermaid pres, which pretty-code would otherwise treat as
   block code and highlight as plaintext). */

import rehypePrettyCode, { type Options } from "rehype-pretty-code"
import { rehypeMermaidBlock } from "@/lib/rehype-mermaid-block"

const rehypePrettyCodeOptions: Options = {
  // Dual themes: every token span gets `--shiki-light`/`--shiki-dark` CSS
  // variables; globals.css picks one based on `html.dark`.
  theme: {
    light: "github-light",
    dark: "github-dark",
  },
  keepBackground: false,
  // Backticks must stay out of pretty-code's inline pass: it stamps
  // data-language (the shared `code` component reads that as block →
  // unstyled), emits --shiki-* spans that no rule colors outside
  // .code-block, and strips a trailing `{:[a-zA-Z.-]+}` from the text —
  // inline `{:lang}` annotations are unsupported here and render
  // literally. Block fences still default to plaintext; the inline/block
  // discriminator contract lives in mdx-components.tsx `code`.
  defaultLang: { block: "plaintext", inline: "" },
  bypassInlineCode: true,
  grid: true,
}

export const blogRehypePlugins = [
  rehypeMermaidBlock,
  [rehypePrettyCode, rehypePrettyCodeOptions] as never,
] as never[]
