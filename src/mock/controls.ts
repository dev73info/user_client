/** 给界面用的 mock 操作：切换身份、关闭 mock、暴露调试句柄。 */

import { clearPersistedAuthProfile } from '@/shared/auth/session'
import { AUTH_TOKEN_STORAGE_KEY } from '@/shared/auth/storage'

import { MOCK_IDENTITY_QUERY_KEY, MOCK_QUERY_KEY, forgetMockEnabled, mockEnabled } from './env'
import {
  MOCK_IDENTITIES,
  currentMockIdentity,
  currentMockProfile,
  setMockIdentity,
  type MockIdentity,
} from './identity'
import { clearUncoveredEndpoints, uncoveredEndpoints } from './uncovered'

export type MockDebugApi = {
  readonly enabled: boolean
  readonly identity: MockIdentity
  readonly identities: readonly MockIdentity[]
  readonly uncovered: readonly string[]
  setIdentity(identity: MockIdentity): void
  switchIdentity(identity?: MockIdentity): void
  disable(): void
  clearUncovered(): void
}
/* ------------------------------------------------------------------ 给界面用的操作 */

/**
 * 从地址上摘掉指定参数（保留 hash 与其他参数），再整页刷新。
 *
 * 地址参数在 `mockEnabled()` 里优先级最高，不摘掉的话「刷新回来又被参数开回去」，
 * 表现为按钮点了没用。切换身份要去掉 `?mockAs`，关闭 mock 要去掉 `?mock`。
 */
function reloadWithoutSearchParams(names: readonly string[]): void {
  const search = new URLSearchParams(window.location.search)
  let touched = false

  for (const name of names) {
    if (search.has(name)) {
      search.delete(name)
      touched = true
    }
  }

  if (touched) {
    const query = search.toString()
    window.history.replaceState(
      {},
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
    )
  }

  window.location.reload()
}

/** 换身份：写进 localStorage 后整页刷新（登录态、路由守卫、首屏请求都围绕角色展开，重载最干净）。 */
export function switchMockIdentity(identity?: MockIdentity): void {
  const next = identity ?? currentMockIdentity()
  setMockIdentity(next)

  if (typeof window === 'undefined') {
    return
  }

  // 地址上的 ?mockAs=dev 优先级高于 localStorage，不清掉的话点切换器会「切不动」
  // （写完 localStorage 一刷新又被参数覆盖回去）。
  reloadWithoutSearchParams([MOCK_IDENTITY_QUERY_KEY])
}

/** 关掉 mock，回到真实后端（需要真实后端在 8080 上跑着）。 */
export function disableMock(): void {
  forgetMockEnabled()

  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
    clearPersistedAuthProfile()
  }

  console.info('[mock] 已关闭，刷新后回到真实后端（需要 8080 上跑着后端，会自动重新登录）')

  if (typeof window !== 'undefined') {
    // 连同地址上的 ?mock=1 一起摘掉，否则刷新回来又被参数打开，看起来像「关不掉」。
    reloadWithoutSearchParams([MOCK_QUERY_KEY])
  }
}

export function createDebugApi(): MockDebugApi {
  return {
    get enabled() {
      return mockEnabled()
    },
    get identity() {
      return currentMockIdentity()
    },
    get identities() {
      return MOCK_IDENTITIES
    },
    get uncovered() {
      return uncoveredEndpoints.value
    },
    setIdentity: setMockIdentity,
    switchIdentity: switchMockIdentity,
    disable: disableMock,
    clearUncovered: clearUncoveredEndpoints,
  }
}

/** 身份与用户名信息，供身份切换器展示。 */
export function currentMockIdentityLabel(): string {
  const profile = currentMockProfile()
  return `${profile.label}（${profile.username}）`
}
