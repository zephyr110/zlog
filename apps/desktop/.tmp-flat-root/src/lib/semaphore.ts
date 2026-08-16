/** Simple async semaphore limiting concurrent uploads — GitHub pushes are
 *  IO-bound (10-60s each), so 3 in flight hides most of the latency while
 *  staying well within GitHub's API rate budget. */
export function createSemaphore(max: number) {
  let current = 0
  const queue: Array<() => void> = []
  return {
    acquire(): Promise<void> {
      if (current < max) {
        current++
        return Promise.resolve()
      }
      return new Promise<void>((resolve) => {
        queue.push(() => {
          current++
          resolve()
        })
      })
    },
    release(): void {
      current--
      queue.shift()?.()
    },
  }
}
