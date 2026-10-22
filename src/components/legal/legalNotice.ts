// 重要条款提示的公共常量与留痕辅助（R043 任务-03）。
//
// ⚠️ **改这份提示的文案（摘要、条目、顺序）时，必须同步升 `LEGAL_NOTICE_VERSION`。**
// 协议同意留痕里存了 `notice_version`，它要证明"用户看到的是哪一版提示"；
// 文案改了、版本号没升，留痕里的提示版本就失去意义，等于白留。
//
// ⚠️ 提示摘要只做"人话翻译"：不新增平台义务、不扩大或缩小责任范围。
// 摘要与协议正文不一致时**以正文为准**。

/** 重要条款提示的版本号。改提示文案时同步升版本。 */
export const LEGAL_NOTICE_VERSION = '2026-10-21-v1'

/**
 * 本次会话里用户确认"已阅读重要条款提示"的时间。
 *
 * 为什么放 sessionStorage：登录 / 注册的留痕接口需要登录态，只能登录成功后再补记，
 * 所以勾选时间要先存下来跨过一次登录跳转。
 * 为什么不用 localStorage：勾选状态**不跨会话**——上次勾过就一直算同意是错的。
 */
const NOTICE_CONFIRMED_AT_KEY = '73info_legal_notice_confirmed_at'

/** 记录本次会话的提示确认时间。 */
export function rememberLegalNoticeConfirmedAt(value: string): void {
  try {
    sessionStorage.setItem(NOTICE_CONFIRMED_AT_KEY, value)
  } catch {
    // 隐私模式 / 存储被禁用时忽略：提示确认时间拿不到就留空，后端会记成空值，
    // 不编造时间（留痕里的 notice_confirmed_at 允许为空）。
  }
}

/** 读取本次会话的提示确认时间；没有则返回空串。 */
export function readLegalNoticeConfirmedAt(): string {
  try {
    return sessionStorage.getItem(NOTICE_CONFIRMED_AT_KEY) ?? ''
  } catch {
    return ''
  }
}

/** 清掉本次会话的提示确认时间（登录成功补记后调用，避免重复补记）。 */
export function clearLegalNoticeConfirmedAt(): void {
  try {
    sessionStorage.removeItem(NOTICE_CONFIRMED_AT_KEY)
  } catch {
    // 同上：存储不可用时忽略。
  }
}
