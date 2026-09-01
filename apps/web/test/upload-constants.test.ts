import { describe, expect, it } from "vitest"
import {
  isUploadableImage,
  MAX_UPLOAD_BYTES,
  UPLOAD_ACCEPT,
} from "@/lib/upload-constants"

function fakeFile(type: string, size: number): File {
  return new File([new Uint8Array(Math.min(size, 1024))], "a.png", { type })
}

describe("isUploadableImage", () => {
  it("accepts allowed image types within the size limit", () => {
    expect(isUploadableImage(fakeFile("image/png", 100))).toBe(true)
    expect(isUploadableImage(fakeFile("image/svg+xml", 1024))).toBe(true)
  })

  it("rejects non-image types even when small", () => {
    expect(isUploadableImage(fakeFile("text/html", 100))).toBe(false)
    expect(isUploadableImage(fakeFile("application/pdf", 100))).toBe(false)
  })

  it("rejects files over the size cap", () => {
    const tooBig = new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], "big.png", {
      type: "image/png",
    })
    expect(isUploadableImage(tooBig)).toBe(false)
  })
})

describe("upload constants", () => {
  it("keeps the 5MB cap", () => {
    expect(MAX_UPLOAD_BYTES).toBe(5 * 1024 * 1024)
  })

  it("accepts exactly the server's ALLOWED_TYPES", () => {
    expect(UPLOAD_ACCEPT.split(",").sort()).toEqual(
      ["image/gif", "image/jpeg", "image/png", "image/svg+xml", "image/webp"].sort()
    )
  })
})
