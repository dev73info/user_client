/**
 * 请求层 401 后的静默续期入口。
 *
 * 请求层不能直接依赖 auth store（会形成循环引用）：store 创建时把自己的续期函数
 * 注册进来，请求层只负责在 401 时调用它。没有会话时返回 `null`，按原 401 处理。
 */
type SessionRefreshHandler = () => Promise<string | null>

let handler: SessionRefreshHandler | null = null
let inFlight: Promise<string | null> | null = null

export function setSessionRefreshHandler(next: SessionRefreshHandler | null): void {
  handler = next
}

export function requestSessionRefresh(): Promise<string | null> {
  if (!handler) {
    return Promise.resolve(null)
  }

  // 并发 401 共用同一次换票：刷新令牌会轮换，各换各的会把彼此作废。
  if (!inFlight) {
    inFlight = handler().finally(() => {
      inFlight = null
    })
  }
  return inFlight
}
