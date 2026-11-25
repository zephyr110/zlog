import { MDXRemote } from "next-mdx-remote/rsc"
import { type Post } from "@zlog/database"
import { mdxComponents } from "@/components/blog/mdx-components"
import { normalizeMathDelimiters } from "@/lib/mdx-math"
import { blogRemarkPlugins, blogRehypePlugins } from "@/lib/mdx-pipeline"

interface MDXRendererProps {
  post: Post
}

/** Renders post MDX. Prose chrome lives on the caller so we don't nest
 *  `.prose` (which fights `prose-lg` sizing). */
export function MDXRenderer({ post }: MDXRendererProps) {
  return (
    <MDXRemote
      source={normalizeMathDelimiters(post.content)}
      options={{
        parseFrontmatter: false,
        mdxOptions: {
          remarkPlugins: blogRemarkPlugins,
          rehypePlugins: blogRehypePlugins,
        },
      }}
      components={mdxComponents}
    />
  )
}
