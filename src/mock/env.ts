/**
 * mock 层的总开关与调试参数。
 *
 * 三层门槛，缺一个都不开：
 * 1. `import.meta.env.MODE === 'development'`——只有 `pnpm dev` 才可能命中，
 *    `pnpm build`（production）与单测（test）永远拿不到 mock，所以 mock 代码不会影响线上与现有单测。
 * 2. 显式打开：`.env.local` 里 `VITE_MOCK=true`，或地址上带 `?mock=1`。
 * 3. 地址上的 `?mock=1` 会在路由跳转后消失，所以一旦命中就记进 sessionStorage，
 *    刷新与页内跳转期间一直有效；`?mock=0` 可以当场关掉。
 */

export const MOCK_QUERY_KEY = 'mock'
export const MOCK_IDENTITY_QUERY_KEY = 'mockAs'
export const MOCK_DELAY_QUERY_KEY = 'mockDelay'

/** 假响应默认的人为延迟，用来让加载态、骨架屏真的跑一遍。 */
export const DEFAULT_MOCK_DELAY_MS = 120

const MOCK_SESSION_KEY = 'mock_enabled_73hub'

function readSearchParam(name: string): string {
  if (typeof window === 'undefined') {
    return ''
  }

  return (new URLSearchParams(window.location.search).get(name) ?? '').trim()
}

function readSessionFlag(): boolean {
  if (typeof sessionStorage === 'undefined') {
    return false
  }

  return sessionStorage.getItem(MOCK_SESSION_KEY) === '1'
}

function writeSessionFlag(enabled: boolean): void {
  if (typeof sessionStorage === 'undefined') {
    return
  }

  if (enabled) {
    sessionStorage.setItem(MOCK_SESSION_KEY, '1')
    return
  }

  sessionStorage.removeItem(MOCK_SESSION_KEY)
}

/** 当前构建是否允许开 mock：只有 vite dev 允许。 */
export function mockSupported(): boolean {
  return import.meta.env.MODE === 'development'
}

/** mock 是否处于开启状态。 */
export function mockEnabled(): boolean {
  if (!mockSupported()) {
    return false
  }

  if (import.meta.env.VITE_MOCK === 'true') {
    return true
  }

  const param = readSearchParam(MOCK_QUERY_KEY).toLowerCase()
  if (param === '1' || param === 'true') {
    writeSessionFlag(true)
    return true
  }

  if (param === '0' || param === 'false') {
    writeSessionFlag(false)
    return false
  }

  return readSessionFlag()
}

/** 打开 mock 时把 sessionStorage 标记也补上，供页内跳转后继续命中。 */
export function rememberMockEnabled(): void {
  if (mockEnabled()) {
    writeSessionFlag(true)
  }
}

/** 关掉 mock 的会话标记：回到真实后端时用（`VITE_MOCK=true` 这种环境变量开法关不掉，只能改 .env.local）。 */
export function forgetMockEnabled(): void {
  writeSessionFlag(false)
}

function readPositiveInt(raw: string, fallback: number): number {
  const value = Number.parseInt(raw, 10)
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

/** 假响应延迟毫秒数。`?mockDelay=0` 可以彻底关掉延迟，方便连续点页面。 */
export function mockDelayMs(): number {
  if (!mockEnabled()) {
    return 0
  }

  const fromQuery = readSearchParam(MOCK_DELAY_QUERY_KEY)
  if (fromQuery) {
    return readPositiveInt(fromQuery, DEFAULT_MOCK_DELAY_MS)
  }

  const fromEnv = (import.meta.env.VITE_MOCK_DELAY ?? '').trim()
  if (fromEnv) {
    return readPositiveInt(fromEnv, DEFAULT_MOCK_DELAY_MS)
  }

  return DEFAULT_MOCK_DELAY_MS
}

/** 声明的假响应延迟（异步等待用）。 */
export function mockDelay(): Promise<void> {
  const delay = mockDelayMs()
  if (delay <= 0) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    setTimeout(resolve, delay)
  })
}
