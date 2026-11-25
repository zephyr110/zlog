import { describe, expect, it } from "vitest"
import { serialize } from "next-mdx-remote/serialize"
import { normalizeMathDelimiters } from "@/lib/mdx-math"
import { blogRemarkPlugins, blogRehypePlugins } from "@/lib/mdx-pipeline"

/** Compile through the exact plugins both article surfaces use. */
async function compile(source: string) {
  const { compiledSource } = await serialize(normalizeMathDelimiters(source), {
    parseFrontmatter: false,
    mdxOptions: {
      remarkPlugins: blogRemarkPlugins,
      rehypePlugins: blogRehypePlugins,
    },
  })
  return compiledSource
}

describe("blog MDX math pipeline", () => {
  it("compiles \\[...\\] into a display KaTeX node", async () => {
    const code = await compile("**第三步**。\\[\n\\text{F} = \\frac{a}{b}\n\\]")
    expect(code).toContain("katex-display")
    expect(code).toContain("application/x-tex")
  })

  it("compiles \\(...\\) into inline KaTeX without escaping LaTeX braces", async () => {
    const code = await compile("其中 \\(v_k \\in \\{0, 1\\}\\) 表示第 \\(k\\) 个片段")
    expect(code).toContain("katex")
    expect(code).not.toContain("katex-display")
  })
})
