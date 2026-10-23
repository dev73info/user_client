/** mock 的登录态准备：按当前身份写一个假令牌，省掉没有 `.env.local` 时的登录步骤。 */

import { clearPersistedAuthProfile } from '@/shared/auth/session'
import { AUTH_TOKEN_STORAGE_KEY } from '@/shared/auth/storage'

import type { MockIdentity } from './identity'
import { createMockToken, parseMockToken } from './token'

/* ------------------------------------------------------------------ 会话准备 */

/**
 * 给当前身份准备好登录态。
 *
 * 为什么需要这一步：mock 不校验账号密码，直接按身份发一个假令牌写进 localStorage，
 * 于是没有 `.env.local` 也能直接进两个工作台，也让需求方/开发者两侧可以同时在线。
 *
 * 判定很简单：localStorage 里已经是「当前身份的 mock 令牌」就什么都不做，
 * 其余情况（没有令牌、是真实后端的令牌、是另一个身份的令牌）一律换成当前身份的。
 * 之前这里还额外记了一个「已经发过令牌」的标记用来尊重手动登出，结果踩了坑：
 * 只要有一次页面在 mock 没生效的状态下加载过（自动登录失败会清掉令牌），
 * 之后即使 mock 生效也永远补不回登录态，页面就一直停在未登录。
 * 想测未登录状态：在面板里点「退出当前账号」后不要刷新页面即可。
 */
export function prepareMockSession(identity: MockIdentity): void {
  if (typeof localStorage === 'undefined') {
    return
  }

  const existing = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ?? ''
  const subject = existing ? parseMockToken(existing) : null

  if (subject?.identity === identity) {
    return
  }

  localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, createMockToken(identity))
  clearPersistedAuthProfile()
}
