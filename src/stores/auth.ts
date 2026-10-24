import { defineStore } from 'pinia'

import { createAuthActions } from '@/stores/auth/actions'
import { createAuthSession } from '@/stores/auth/session'

export type { LoginResult } from '@/stores/auth/types'

/**
 * 登录态 store。
 *
 * 拆分（R047）：核心会话（令牌、持久化、刷新调度、档案拉取）在 `stores/auth/session.ts`，
 * 动作面（开发者资格校验与登录 / 注册 / 邮箱验证码）在 `stores/auth/actions.ts`，
 * 对外公开面（state / getter / action 的名字与返回值）与拆分前完全一致。
 */
export const useAuthStore = defineStore('auth', () => {
  const session = createAuthSession()
  const actions = createAuthActions(session)

  return {
    token: session.token,
    username: session.username,
    role: session.role,
    loading: session.loading,
    profileLoaded: session.profileLoaded,
    hydrated: session.hydrated,
    isAuthed: session.isAuthed,
    isDev: session.isDev,
    permissions: session.permissions,
    privilegesLoaded: session.privilegesLoaded,
    isSuperAdmin: session.isSuperAdmin,
    hasPermission: session.hasPermission,
    devAccessError: session.devAccessError,
    developerAgreementSigned: session.developerAgreementSigned,
    apiUsageAgreementSigned: session.apiUsageAgreementSigned,
    authHeaders: session.authHeaders,
    hydrate: session.hydrate,
    fetchProfile: session.fetchProfile,
    fetchPrivileges: session.fetchPrivileges,
    initializeSession: session.initializeSession,
    ensureDevAccess: actions.ensureDevAccess,
    login: actions.login,
    register: actions.register,
    sendRegisterEmailCode: actions.sendRegisterEmailCode,
    sendResetPasswordEmailCode: actions.sendResetPasswordEmailCode,
    resetPasswordWithEmail: actions.resetPasswordWithEmail,
    registerWithEmail: actions.registerWithEmail,
    setToken: session.setToken,
    applyExternalSession: session.applyExternalSession,
    logout: session.logout,
  }
})
