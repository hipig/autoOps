export function random(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}