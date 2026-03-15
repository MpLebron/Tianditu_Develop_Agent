export class AsyncLimiter {
  private activeCount = 0
  private readonly queue: Array<() => void> = []

  constructor(private readonly concurrency: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await task()
    } finally {
      this.release()
    }
  }

  private acquire(): Promise<void> {
    if (this.activeCount < this.concurrency) {
      this.activeCount += 1
      return Promise.resolve()
    }

    return new Promise((resolve) => {
      this.queue.push(() => {
        this.activeCount += 1
        resolve()
      })
    })
  }

  private release() {
    this.activeCount = Math.max(0, this.activeCount - 1)
    const next = this.queue.shift()
    if (next) next()
  }
}

export function normalizeConcurrencyLimit(value: number | undefined, fallback = 2): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(1, Math.floor(value as number))
}
