/**
 * mock 层的总开关与调试参数。
 *
 * 门槛一：`import.meta.env.MODE === 'development'`——只有 `pnpm dev` 才可能命中，
 * `pnpm build`（production）与单测（test）永远拿不到 mock，所以 mock 代码不会影响线上与现有单测。
 *
 * 门槛一之后按下面的优先级取值，先命中先返回，`resolveMockEnabled` 是唯一口径：
 *
 * 1. 地址参数 `?mock=1` / `?mock=0`——最明确，永远优先。参数会在路由跳转后从地址上消失，
 *    所以一命中就记进 sessionStorage，刷新与页内跳转期间一直有效。
 * 2. sessionStorage 里的会话覆盖——记着「本次会话明确开」或「本次会话明确关」。
 *    左上角面板上的「关闭 mock」写的就是这里的「明确关」，因此它能压过 `.env.local` 里的
 *    `VITE_MOCK=true`，任何一种开启方式都关得掉。
 * 3. `.env.local` 的 `VITE_MOCK=true`——兜底默认值。
 *
 * 三者都没有表态就是关。想从「明确关」回到环境变量口径，加一次 `?mock=1`，或关掉标签页重开。
 */

export const MOCK_QUERY_KEY = 'mock'
export const MOCK_IDENTITY_QUERY_KEY = 'mockAs'
export const MOCK_DELAY_QUERY_KEY = 'mockDelay'

/** 假响应默认的人为延迟，用来让加载态、骨架屏真的跑一遍。 */
export const DEFAULT_MOCK_DELAY_MS = 120

const MOCK_SESSION_KEY = 'mock_enabled_73hub'

/** 会话覆盖：`true` 明确开、`false` 明确关、`null` 表示没表态（跟随环境变量）。 */
type MockOverride = boolean | null

function readSearchParam(name: string): string {
  if (typeof window === 'undefined') {
    return ''
  }

  return (new URLSearchParams(window.location.search).get(name) ?? '').trim()
}

/** 解析地址参数：`1` / `true` 是开，`0` / `false` 是关，其余（含空值）是没表态。 */
function parseMockParam(raw: string): MockOverride {
  const param = raw.toLowerCase()

  if (param === '1' || param === 'true') {
    return true
  }

  if (param === '0' || param === 'false') {
    return false
  }

  return null
}

function readSessionOverride(): MockOverride {
  if (typeof sessionStorage === 'undefined') {
    return null
  }

  const raw = sessionStorage.getItem(MOCK_SESSION_KEY)

  if (raw === '1') {
    return true
  }

  if (raw === '0') {
    return false
  }

  return null
}

function writeSessionOverride(enabled: boolean): void {
  if (typeof sessionStorage === 'undefined') {
    return
  }

  sessionStorage.setItem(MOCK_SESSION_KEY, enabled ? '1' : '0')
}

/** 当前构建是否允许开 mock：只有 vite dev 允许。 */
export function mockSupported(): boolean {
  return import.meta.env.MODE === 'development'
}

/**
 * 左上角的 mock 身份切换悬浮窗是否显示。
 *
 * 与 mock 开关**分开**：有些场合只要假数据、不想让悬浮窗挡住页面（截图对照、走查、演示），
 * 设 `VITE_MOCK_SWITCHER=false` 即可隐藏；不写就保持默认显示。
 */
export function mockSwitcherEnabled(): boolean {
  return import.meta.env.VITE_MOCK_SWITCHER !== 'false'
}

/**
 * mock 开关的判定口径。纯函数，不读环境、不写存储，便于把优先级钉进单测。
 *
 * 优先级：地址参数 → 会话覆盖 → 环境变量；三者都没表态就是关。
 */
export function resolveMockEnabled(input: {
  /** 是否处于允许 mock 的构建（只有 vite dev） */
  supported: boolean
  /** 地址上 `?mock=` 的原始值 */
  urlParam: string
  /** sessionStorage 里的会话覆盖 */
  override: MockOverride
  /** 构建时的 `VITE_MOCK === 'true'` */
  envFlag: boolean
}): boolean {
  if (!input.supported) {
    return false
  }

  const fromUrl = parseMockParam(input.urlParam)
  if (fromUrl !== null) {
    return fromUrl
  }

  if (input.override !== null) {
    return input.override
  }

  return input.envFlag
}

/** 地址上是否明确要求开 mock（用于「在 build 里加 ?mock=1 却不生效」时给出提示）。 */
export function mockRequestedInUrl(): boolean {
  return parseMockParam(readSearchParam(MOCK_QUERY_KEY)) === true
}

/** mock 是否处于开启状态。 */
export function mockEnabled(): boolean {
  const supported = mockSupported()
  const urlParam = readSearchParam(MOCK_QUERY_KEY)

  // 地址上明确表态过就记进 sessionStorage，路由跳转把参数冲掉之后仍然算数。
  if (supported) {
    const fromUrl = parseMockParam(urlParam)
    if (fromUrl !== null) {
      writeSessionOverride(fromUrl)
    }
  }

  return resolveMockEnabled({
    supported,
    urlParam,
    override: readSessionOverride(),
    envFlag: import.meta.env.VITE_MOCK === 'true',
  })
}

/** 打开 mock 时把会话标记也补上，供页内跳转后继续命中。 */
export function rememberMockEnabled(): void {
  if (mockEnabled()) {
    writeSessionOverride(true)
  }
}

/**
 * 关掉 mock：写一条「本次会话明确关」的覆盖，优先级高于 `.env.local` 的 `VITE_MOCK=true`。
 * 因此不论 mock 是怎么打开的，面板上的「关闭 mock」都关得掉；
 * 想回到环境变量口径，加一次 `?mock=1`，或关掉标签页重开（会话覆盖存在 sessionStorage 里）。
 */
export function forgetMockEnabled(): void {
  writeSessionOverride(false)
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
