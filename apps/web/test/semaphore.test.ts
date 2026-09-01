import { describe, expect, it } from "vitest"
import { createSemaphore } from "@/lib/semaphore"
import { displayName } from "@/lib/comment-shared"

describe("createSemaphore", () => {
  it("allows up to `max` concurrent acquisitions", async () => {
    const sem = createSemaphore(2)
    await sem.acquire()
    await sem.acquire()
    // Third acquire must wait.
    let thirdReleased = false
    const third = sem.acquire().then(() => {
      thirdReleased = true
    })
    await Promise.resolve()
    expect(thirdReleased).toBe(false)

    sem.release()
    await third
    expect(thirdReleased).toBe(true)
  })

  it("releases in FIFO order", async () => {
    const sem = createSemaphore(1)
    await sem.acquire()
    const order: number[] = []
    const p1 = sem.acquire().then(() => order.push(1))
    const p2 = sem.acquire().then(() => order.push(2))
    await Promise.resolve()
    sem.release()
    await p1
    sem.release()
    await p2
    expect(order).toEqual([1, 2])
  })
})

describe("displayName", () => {
  it("renders Anonymous_* names as plain Anonymous", () => {
    expect(displayName("Anonymous_ab12cd34")).toBe("Anonymous")
  })

  it("falls back for empty names", () => {
    expect(displayName("")).toBe("Anonymous")
  })

  it("keeps real names untouched", () => {
    expect(displayName("Zephyr")).toBe("Zephyr")
  })
})
