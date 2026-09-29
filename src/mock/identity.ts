/**
 * mock 身份：客户（需求方）与开发者。
 *
 * 身份决定了 mock 返回的登录角色与数据视角。切换身份会整页刷新，
 * 因为登录态、路由守卫、各页面的首屏请求都是围绕角色展开的，重载是唯一不会留下脏状态的做法。
 * 身份落在 localStorage，刷新后仍然有效，因此在两个标签页里可以分别开两个身份。
 */

export const MOCK_IDENTITY_STORAGE_KEY = 'mock_identity_73hub'

export type MockIdentity = 'client' | 'dev'

export const MOCK_IDENTITIES: readonly MockIdentity[] = ['client', 'dev']

export type MockIdentityProfile = {
  /** 身份标识 */
  id: MockIdentity
  /** 切换器上的中文名 */
  label: string
  /** 一句话说明这一侧能看到什么 */
  description: string
  /** 登录用户名 */
  username: string
  /** 后端角色标记，决定 `auth.isDev` 与开发者工作台是否可进入 */
  role: 'client' | 'dev'
  /** 昵称 */
  nickname: string
  /** 邮箱 */
  email: string
  /** 手机号 */
  phone: string
  /** 头像占位色，用于 mock 数据里的 avatar 字段 */
  avatarColor: string
}

/**
 * 客户身份的用户名默认跟 `.env.local` 的自动登录账号保持一致：
 * App.vue 的自动登录会在「已登录用户名 ≠ 环境变量里的用户名」时重新登录一次，
 * 两边对齐就不会每次刷新都白跑一次登录。
 */
function clientUsername(): string {
  const fromEnv = (import.meta.env.VITE_DEV_AUTO_LOGIN_USERNAME ?? '').trim()
  return fromEnv || 'client_flow_03562487'
}

export const MOCK_IDENTITY_PROFILES: Record<MockIdentity, MockIdentityProfile> = {
  client: {
    id: 'client',
    label: '客户',
    description: '需求方视角：发布需求、签约、付款、验收、开票',
    username: clientUsername(),
    role: 'client',
    nickname: '柒参演示·需求方',
    email: 'client@example.com',
    phone: '13800000001',
    avatarColor: '#2563eb',
  },
  dev: {
    id: 'dev',
    label: '开发者',
    description: '开发者视角：需求大厅、接单、资源与版本、交付、钱包提现',
    username: 'dev_flow_03562487',
    role: 'dev',
    nickname: '柒参演示·开发者',
    email: 'dev@example.com',
    phone: '13800000002',
    avatarColor: '#0f766e',
  },
}

/** 客户身份的登录名与 .env.local 对齐（见 clientUsername 的说明）。 */

export function isMockIdentity(value: unknown): value is MockIdentity {
  return value === 'client' || value === 'dev'
}

function readStoredIdentity(): MockIdentity | null {
  if (typeof localStorage === 'undefined') {
    return null
  }

  const raw = localStorage.getItem(MOCK_IDENTITY_STORAGE_KEY)
  return isMockIdentity(raw) ? raw : null
}

/**
 * 当前 mock 身份。地址上的 `?mockAs=dev` 优先级最高（便于把链接发给别人复现同一视角），
 * 其次才是 localStorage 里记住的身份。
 */
export function currentMockIdentity(): MockIdentity {
  if (typeof window !== 'undefined') {
    const fromQuery = (new URLSearchParams(window.location.search).get('mockAs') ?? '').trim()
    if (isMockIdentity(fromQuery)) {
      return fromQuery
    }
  }

  return readStoredIdentity() ?? 'client'
}

export function currentMockProfile(): MockIdentityProfile {
  return MOCK_IDENTITY_PROFILES[currentMockIdentity()]
}

export function setMockIdentity(identity: MockIdentity): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(MOCK_IDENTITY_STORAGE_KEY, identity)
  }
}

export function otherMockIdentity(identity: MockIdentity): MockIdentity {
  return identity === 'client' ? 'dev' : 'client'
}
