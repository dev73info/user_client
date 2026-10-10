// Cloudflare Turnstile 人机验证（前端）。
//
// 职责边界：本模块只负责**取 token**——按需加载官方脚本、显式渲染挂件、把一次性 token
// 交给调用方随请求提交。**判定一律在后端**（后端调 siteverify，见
// backend_73info/src/modules/turnstile.rs）；前端的 token 只是凭证，拿它当放行依据是错的。
//
// 站点密钥走未入库的本地环境变量 `VITE_TURNSTILE_SITE_KEY`：**留空即整个功能不启用**
// （不加载官方脚本、不渲染挂件、不发 token），后端也应在 `[turnstile] enabled=false` 时关闭校验。

/** 官方脚本地址：`render=explicit` 表示由我们显式调用 `turnstile.render`，便于控制生命周期与 reset。 */
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
const SCRIPT_ID = 'cf-turnstile-script'
/** 脚本 onload 回调在 window 上的挂载名（Cloudflare 用它通知 API 就绪）。 */
const READY_CALLBACK = '__73infoTurnstileReady'

/** 一个可渲染的挂件表面：动作名必须与后端 `turnstile::guard` 的 `expected_action` 一致。 */
export type TurnstileSurfaceAction = 'login' | 'register' | 'reset_password'

export type TurnstileRenderOptions = {
  sitekey: string
  action?: string
  theme?: 'auto' | 'light' | 'dark'
  size?: 'normal' | 'compact' | 'flexible'
  callback?: (token: string) => void
  'error-callback'?: (errorCode?: string) => void
  'expired-callback'?: () => void
  'timeout-callback'?: () => void
}

/** 官方全局 API（只声明我们用到的方法）。 */
export type TurnstileApi = {
  render: (container: HTMLElement | string, options: TurnstileRenderOptions) => string | undefined
  reset: (widgetId?: string) => void
  remove: (widgetId?: string) => void
  getResponse: (widgetId?: string) => string | undefined
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
    /** Turnstile 脚本就绪回调（名字与 READY_CALLBACK 一致）。 */
    __73infoTurnstileReady?: () => void
  }
}

/** 站点密钥；未配置时返回空串。 */
export function getTurnstileSiteKey(): string {
  const key = import.meta.env.VITE_TURNSTILE_SITE_KEY
  return typeof key === 'string' ? key.trim() : ''
}

/** 是否启用挂件（只看前端有没有配 sitekey）。 */
export function isTurnstileEnabled(): boolean {
  return getTurnstileSiteKey().length > 0
}

let scriptPromise: Promise<TurnstileApi> | null = null

/**
 * 按需加载官方脚本，返回就绪后的 `window.turnstile`。
 *
 * 多次调用共享同一个 Promise；脚本标签以固定 id 复用，不会重复插入。
 */
export function loadTurnstile(): Promise<TurnstileApi> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('人机验证只能在浏览器环境加载'))
  }
  if (window.turnstile) {
    return Promise.resolve(window.turnstile)
  }
  if (scriptPromise) {
    return scriptPromise
  }

  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
    const script = existing ?? document.createElement('script')

    const settle = (api: TurnstileApi | undefined, error?: Error) => {
      script.removeEventListener('load', onLoad)
      script.removeEventListener('error', onError)
      if (api) {
        resolve(api)
      } else {
        scriptPromise = null
        reject(error ?? new Error('人机验证加载失败'))
      }
    }

    const onLoad = () => {
      if (window.turnstile) {
        settle(window.turnstile)
        return
      }
      // 个别情况下 load 事件早于全局 API 就绪，轮询几次兜底。
      let attempts = 0
      const poll = () => {
        if (window.turnstile) {
          settle(window.turnstile)
          return
        }
        attempts += 1
        if (attempts >= 40) {
          settle(undefined, new Error('人机验证脚本已加载但不可用'))
          return
        }
        window.setTimeout(poll, 50)
      }
      window.setTimeout(poll, 0)
    }
    const onError = () => settle(undefined, new Error('人机验证脚本加载失败'))

    script.addEventListener('load', onLoad, { once: true })
    script.addEventListener('error', onError, { once: true })

    // 用 onload 回调让 Cloudflare 通知就绪；与 load 事件互为兜底。
    Object.assign(window, {
      [READY_CALLBACK]: () => {
        if (window.turnstile) {
          settle(window.turnstile)
        }
      },
    })

    if (!existing) {
      script.id = SCRIPT_ID
      script.src = `${SCRIPT_SRC}&onload=${READY_CALLBACK}`
      script.async = true
      script.defer = true
      script.addEventListener('error', () => {
        // 首次加载失败时清掉标签，允许「重试」重新插入。
        script.remove()
      })
      document.head.appendChild(script)
    }
  })

  return scriptPromise
}

/** 供单测 / 走查重置加载状态（仅测试用）。 */
export function __resetTurnstileLoaderForTests(): void {
  scriptPromise = null
}
