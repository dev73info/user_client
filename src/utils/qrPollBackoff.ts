/**
 * 扫码登录（微信登录 / 微信绑定 / QQ 登录）的轮询节奏。
 *
 * 后端对扫码状态接口按 IP 限流 120 次 / 300 秒（`src/modules/auth/handlers/oauth.rs`
 * 里的 `auth:oauth:wechat:login:qr:status:ip` 等 bucket，见 2026-10-14 生产日志里
 * 连续的 `rate limit exceeded (redis)`），而固定每 2 秒轮询一次就是 150 次 / 300 秒——
 * 只要弹窗挂满 4 分钟，单个页签自己就能把额度打穿，之后每次查询都收 429，
 * 手机确认了也等不到登录结果。
 *
 * 这里改成先密后疏：扫码后的前 30 秒保持 2 秒一次（保证“扫完就能进”的手感），
 * 之后 5 秒、10 秒。一整轮 5 分钟约 50 次，给同一 IP 的其它页签与人留足余量。
 */

/** 前 30 秒的轮询间隔：保持扫码后的登录手感。 */
export const QR_POLL_FAST_DELAY_MS = 2000
/** 30 秒 ~ 2 分钟的轮询间隔。 */
export const QR_POLL_MEDIUM_DELAY_MS = 5000
/** 2 分钟之后的轮询间隔：只为“挂着的弹窗”保留兜底查询。 */
export const QR_POLL_SLOW_DELAY_MS = 10000

/** 2 秒档覆盖的轮询次数（约 30 秒）。 */
const FAST_POLL_COUNT = 15
/** 2 秒档 + 5 秒档覆盖的轮询次数（约 2 分钟）。 */
const MEDIUM_POLL_COUNT = 33

/**
 * 返回第 `attempt` 次轮询（已完成次数，从 0 开始）之后应等待的毫秒数。
 */
export function qrPollDelayMs(attempt: number): number {
  if (attempt < FAST_POLL_COUNT) {
    return QR_POLL_FAST_DELAY_MS
  }
  if (attempt < MEDIUM_POLL_COUNT) {
    return QR_POLL_MEDIUM_DELAY_MS
  }
  return QR_POLL_SLOW_DELAY_MS
}
