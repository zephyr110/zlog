import { describe, expect, it } from "vitest"
import { hasDangerousSvgContent } from "@/lib/svg-sanitize"

describe("hasDangerousSvgContent", () => {
  it("accepts a plain decorative SVG", () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
      '<rect width="24" height="24" rx="4" fill="#555"/>' +
      '<path d="M4 12h16"/>' +
      "</svg>"
    expect(hasDangerousSvgContent(svg)).toBe(false)
  })

  it("rejects an inline <script>", () => {
    expect(
      hasDangerousSvgContent(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
      )
    ).toBe(true)
  })

  it("rejects event-handler attributes (quoted values)", () => {
    expect(
      hasDangerousSvgContent('<svg xmlns="http://www.w3.org/2000/svg"><rect onload="evil()"/></svg>')
    ).toBe(true)
    expect(
      hasDangerousSvgContent('<svg xmlns="http://www.w3.org/2000/svg"><g onclick="alert(1)"/></svg>')
    ).toBe(true)
    expect(
      hasDangerousSvgContent("<svg xmlns='http://www.w3.org/2000/svg'><circle onerror='x()'/></svg>")
    ).toBe(true)
  })

  it("does not flag a bare onload= mention in text content", () => {
    // XML requires quoted attribute values — unquoted handlers can't
    // execute, so a text mention must not reject a legit SVG.
    expect(
      hasDangerousSvgContent('<svg xmlns="http://www.w3.org/2000/svg"><text>onload=1 is inert</text></svg>')
    ).toBe(false)
  })

  it("rejects javascript: URLs", () => {
    expect(
      hasDangerousSvgContent('<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"/></svg>')
    ).toBe(true)
  })

  it("rejects foreignObject / object / embed / iframe", () => {
    expect(
      hasDangerousSvgContent('<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div>hi</div></foreignObject></svg>')
    ).toBe(true)
    expect(
      hasDangerousSvgContent('<svg xmlns="http://www.w3.org/2000/svg"><object data="x"/></svg>')
    ).toBe(true)
    expect(
      hasDangerousSvgContent('<svg xmlns="http://www.w3.org/2000/svg"><iframe src="x"/></svg>')
    ).toBe(true)
  })

  it("rejects external references from <use>/<image> but allows #fragments, data: and empty", () => {
    expect(
      hasDangerousSvgContent('<svg xmlns="http://www.w3.org/2000/svg"><use href="https://evil.example/x.svg"/></svg>')
    ).toBe(true)
    expect(
      hasDangerousSvgContent('<svg xmlns="http://www.w3.org/2000/svg"><image xlink:href="http://evil.example/x.png"/></svg>')
    ).toBe(true)
    // Local fragment references are fine (gradients, symbol reuse).
    expect(
      hasDangerousSvgContent('<svg xmlns="http://www.w3.org/2000/svg"><use href="#icon"/></svg>')
    ).toBe(false)
    // data: URLs render as inert images — allowed (common in icon sets).
    expect(
      hasDangerousSvgContent('<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,iVBORw0KGgo="/></svg>')
    ).toBe(false)
    // Empty href is meaningless — allowed.
    expect(
      hasDangerousSvgContent('<svg xmlns="http://www.w3.org/2000/svg"><use href=""/></svg>')
    ).toBe(false)
  })

  it("ignores harmless mentions inside comments and CDATA", () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      "<!-- <script> is mentioned here -->" +
      "<![CDATA[onload= never runs here]]>" +
      "<text>javascript: is just text</text>" +
      "</svg>"
    expect(hasDangerousSvgContent(svg)).toBe(false)
  })

  it("catches obfuscated whitespace between tag name and attributes", () => {
    expect(
      hasDangerousSvgContent('<svg xmlns="http://www.w3.org/2000/svg"><script \n>alert(1)</script></svg>')
    ).toBe(true)
  })

  it("catches entity-encoded javascript: URLs", () => {
    expect(
      hasDangerousSvgContent('<svg xmlns="http://www.w3.org/2000/svg"><a href="java&#x73;cript:alert(1)"/></svg>')
    ).toBe(true)
    expect(
      hasDangerousSvgContent('<svg xmlns="http://www.w3.org/2000/svg"><a href="&#106;avascript:alert(1)"/></svg>')
    ).toBe(true)
  })

  it("rejects external resource loads inside <style>", () => {
    expect(
      hasDangerousSvgContent('<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(https://evil.example/x.css)</style></svg>')
    ).toBe(true)
    expect(
      hasDangerousSvgContent('<svg xmlns="http://www.w3.org/2000/svg"><style>text { background: url(https://evil.example/x.png) }</style></svg>')
    ).toBe(true)
    // Inline styles and fragment/data: URLs are fine.
    expect(
      hasDangerousSvgContent('<svg xmlns="http://www.w3.org/2000/svg"><style>text { fill: url(#grad); font-family: sans-serif }</style></svg>')
    ).toBe(false)
  })

  it("does not reject legit <a href> links (inert under sandbox + img)", () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><a href="https://example.com">' +
      '<text>link</text></a></svg>'
    expect(hasDangerousSvgContent(svg)).toBe(false)
  })
})
