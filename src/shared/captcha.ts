/**
 * 自托管 ALTCHA 人机验证（前端取 payload）。
 *
 * 职责边界：本模块只负责在浏览器里算出**一次性 payload**（ALTCHA 的 PoW 挑战解），
 * 交给调用方随请求提交。**判定一律在后端**（后端校验签名与解，见 backend_73info 的
 * captcha 模块）；payload 只是凭证，拿它当放行依据是错的。
 *
 * 开关走未入库的本地环境变量 `VITE_CAPTCHA_ENABLED`：值为 `true` / `1` 才启用，
 * 其余情况整个功能不启用（不加载挂件、不发 payload），后端也应同步关闭校验。
 * 挑战地址与接口共用 `apiUrl` 的基址口径，不在调用点自己拼 `/api`（会拼成两份）。
 */
import { apiUrl } from '@/shared/api/url'
import type { AltchaWidgetElement } from 'altcha'

/** 与后端约定的挑战端点：`GET /api/captcha/challenge`。 */
const CHALLENGE_PATH = '/captcha/challenge'

/** 是否启用挂件（只看前端开关）。 */
export function isCaptchaEnabled(): boolean {
  const raw = import.meta.env.VITE_CAPTCHA_ENABLED
  if (typeof raw !== 'string') {
    return false
  }
  const value = raw.trim().toLowerCase()
  return value === 'true' || value === '1'
}

/**
 * 挑战地址。
 *
 * 复用 `apiUrl` 的基址逻辑：production（`https://api.73info.cn`）、本地代理（`/api`）、
 * 直连（`http://127.0.0.1:8080`）都落成同一个 `/api/captcha/challenge`，不会重复 `/api`。
 */
export function getCaptchaChallengeUrl(): string {
  return apiUrl(CHALLENGE_PATH)
}

/** 挂件 `statechange` 事件的 detail（ALTCHA v3）。 */
export type AltchaStateChangeDetail = {
  state: 'code' | 'error' | 'verified' | 'verifying' | 'unverified' | 'expired'
  payload?: string
}

/**
 * 挂件的固定属性。
 *
 * 标准复选框样式、进页面自动算；关掉了 ALTCHA 的 logo 与页脚链接（避免在登录框里
 * 出现第三方品牌）。`name` 只是给原生表单提交用的隐藏字段名，本仓走 JSON 提交，
 * 真正的字段仍是契约上的 `turnstile_token`。
 */
export function applyCaptchaAttributes(widget: AltchaWidgetElement): void {
  widget.setAttribute('challenge', getCaptchaChallengeUrl())
  widget.setAttribute('name', 'altcha')
  widget.setAttribute('display', 'standard')
  widget.setAttribute('auto', 'onload')
  widget.setAttribute('language', 'zh-cn')
  widget.setAttribute('configuration', JSON.stringify({ hideLogo: true, hideFooter: true }))
}

let loaderPromise: Promise<void> | null = null

/**
 * 按需加载 ALTCHA（含中文文案），返回就绪后的 Promise。
 *
 * 多次调用共享同一个 Promise；加载失败时清掉缓存，允许「重试」重新加载。
 */
export function loadAltchaWidget(): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('人机验证只能在浏览器环境加载'))
  }
  if (!loaderPromise) {
    loaderPromise = (async () => {
      await import('altcha')
      // 文案包依赖主模块先建好 `$altcha`，所以必须放在后面。
      await import('altcha/i18n/zh-cn')
    })().catch((error: unknown) => {
      loaderPromise = null
      throw error
    })
  }
  return loaderPromise
}

/** 离屏取 payload 的默认超时：PoW 正常一两秒内算完，超过这个时间按失败处理。 */
const OFFSCREEN_PAYLOAD_TIMEOUT_MS = 15_000

/**
 * 不渲染可见挂件，离屏取一枚一次性 payload（本地开发自动登录用）。
 *
 * 自动登录走的就是 `/auth/login`，后端开着人机校验时一律要 payload，所以必须在
 * 登录前自己离屏取一枚。拿到就把容器整个摘掉——页面上不会留下任何可见痕迹。
 *
 * 失败（库加载不了、超时、挂件报错）一律 resolve 空串：自动登录是本地便利功能，
 * 取不到 payload 时应当退回「未登录」而不是抛错打断启动。
 */
export async function fetchCaptchaPayload(): Promise<string> {
  if (!isCaptchaEnabled() || typeof document === 'undefined') {
    return ''
  }

  const container = document.createElement('div')
  container.setAttribute('aria-hidden', 'true')
  container.style.cssText = 'position:fixed;left:-9999px;top:0;width:0;height:0;overflow:hidden'
  document.body.appendChild(container)

  let widget: AltchaWidgetElement | null = null
  let timer: number | undefined
  let onStateChange: ((event: Event) => void) | null = null

  const cleanup = () => {
    if (timer !== undefined) {
      window.clearTimeout(timer)
      timer = undefined
    }
    if (widget && onStateChange) {
      widget.removeEventListener('statechange', onStateChange)
    }
    widget?.remove()
    widget = null
    container.remove()
  }

  try {
    await loadAltchaWidget()
    return await new Promise<string>((resolve) => {
      let settled = false
      const settle = (payload: string) => {
        if (settled) return
        settled = true
        cleanup()
        resolve(payload)
      }

      timer = window.setTimeout(() => settle(''), OFFSCREEN_PAYLOAD_TIMEOUT_MS)
      widget = document.createElement('altcha-widget')
      applyCaptchaAttributes(widget)
      onStateChange = (event) => {
        const detail = (event as CustomEvent<AltchaStateChangeDetail>).detail
        if (!detail) return
        if (detail.state === 'verified') {
          settle(detail.payload ?? '')
        } else if (detail.state === 'expired' || detail.state === 'error') {
          settle('')
        }
      }
      widget.addEventListener('statechange', onStateChange)
      container.appendChild(widget)
    })
  } catch {
    cleanup()
    return ''
  }
}

/** 供单测重置加载状态（仅测试用）。 */
export function __resetAltchaLoaderForTests(): void {
  loaderPromise = null
}
