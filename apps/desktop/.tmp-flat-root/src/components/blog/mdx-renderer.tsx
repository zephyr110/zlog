import { MDXRemote } from "next-mdx-remote/rsc"
import remarkGfm from "remark-gfm"
import { type Post } from "@zlog/database"
import { mdxComponents } from "@/components/blog/mdx-components"
import { blogRehypePlugins } from "@/lib/mdx-pipeline"

interface MDXRendererProps {
  post: Post
}

/** Renders post MDX. Prose chrome lives on the caller so we don't nest
 *  `.prose` (which fights `prose-lg` sizing). */
export function MDXRenderer({ post }: MDXRendererProps) {
  return (
    <MDXRemote
      source={post.content}
      options={{
        parseFrontmatter: false,
        mdxOptions: {
          remarkPlugins: [remarkGfm],
          rehypePlugins: blogRehypePlugins,
        },
      }}
      components={mdxComponents}
    />
  )
}
