import { computed, onBeforeUnmount, watch } from 'vue'
import { useRouter } from 'vue-router'

import { useAuthForm } from './useAuthForm'
import type { AuthMode } from './useRequirementPublish'
import { useAuthStore } from '@/stores/auth'

export type HomePortalAuthOptions = {
  /** URL 取值口径（`useHomeAuthQuery` 那一份）：`modal` / `mode` / `redirect_to` / 邀请码共用。 */
  routeQueryValue: (key: string) => string
  /** 登录成功后重拉首页四批数据（押金比例 / 待办需求 / 平台概览 / 公开资源）。 */
  refreshPortalData: () => Promise<void>
}

/**
 * 首页登录 / 微信扫码两个弹窗的**接线**（R047 从 `views/HomeView.vue` 拆出）。
 *
 * 表单状态、OAuth 与短信走 `useAuthForm`；这里管的是视图那一层：路由决定的登录模式与标题、
 * `redirect_to` / 邀请码 / 分享参数的读回、`openAuth` 拼 query、登录成功后的收尾，
 * 以及把两个弹窗要的 props / 事件收成 `authModalBindings` 与 `wechatQrBindings`。
 *
 * 行为与拆出前逐条一致：
 * - 注册模式带邀请码时，邀请码与分享参数同时回填表单（`watch`，`immediate`）；
 * - `redirect_to` 只接受站内相对地址（`/` 开头且非 `//`）；
 * - 登录成功后先清 `acceptTerms`，有 `redirect_to` 就跳过去（且**不**重拉数据），否则回首页再重拉。
 */
export function useHomePortalAuth(options: HomePortalAuthOptions) {
  const auth = useAuthStore()
  const router = useRouter()

  const authVisible = computed(() => options.routeQueryValue('modal') === 'auth')

  const routeAuthMode = computed<AuthMode>(() => {
    const mode = options.routeQueryValue('mode') || 'login'
    return mode === 'register' || mode === 'reset' ? mode : 'login'
  })

  const {
    authUsername,
    authPassword,
    authEmail,
    authEmailCode,
    authInviteCode,
    authShareType,
    authShareTargetId,
    authTurnstileToken,
    acceptTerms,
    loginRequiresTwoFactor,
    sendCodeLoading,
    sendCodeCountdown,
    githubLoading,
    giteeLoading,
    wechatLoginLoading,
    qqLoginLoading,
    githubAvailable,
    wechatAvailable,
    qqAvailable,
    giteeAvailable,
    resetAuthForm,
    loginWithGithub,
    loginWithGitee,
    loginWithWechat,
    wechatQrLogin,
    closeWechatQrLogin,
    refreshWechatQrLogin,
    handleWechatQrToken,
    loginWithQq,
    sendAuthCode: sendAuthCodeAction,
    submitAuth: submitAuthAction,
  } = useAuthForm(routeAuthMode)

  const authTitle = computed(() => {
    if (routeAuthMode.value === 'login') {
      return '登录账号'
    }
    if (routeAuthMode.value === 'register') {
      return '注册账号'
    }
    return '找回密码'
  })

  const authRedirectTarget = computed(() => {
    const raw = options.routeQueryValue('redirect_to')
    if (!raw || !raw.startsWith('/') || raw.startsWith('//')) {
      return ''
    }
    return raw
  })

  const routeInviteCode = computed(() => {
    const raw = options.routeQueryValue('invite_code')
    return raw && /^[A-Za-z0-9]{1,32}$/.test(raw) ? raw : ''
  })

  const routeShareType = computed(() => {
    const raw = options.routeQueryValue('share_type')
    return ['requirement', 'portfolio', 'resource', 'community_post'].includes(raw) ? raw : ''
  })

  const routeShareTargetId = computed(() => {
    const raw = options.routeQueryValue('share_target_id') || options.routeQueryValue('target_id')
    return raw && /^[A-Za-z0-9_-]{1,64}$/.test(raw) ? raw : ''
  })

  watch(
    () =>
      [
        routeInviteCode.value,
        routeShareType.value,
        routeShareTargetId.value,
        routeAuthMode.value,
      ] as const,
    ([inviteCode, shareType, shareTargetId, mode]) => {
      if (mode === 'register' && inviteCode) {
        authInviteCode.value = inviteCode
        authShareType.value = shareType
        authShareTargetId.value = shareTargetId
      }
    },
    { immediate: true },
  )

  function openAuth(mode: AuthMode, redirectTo = authRedirectTarget.value) {
    const inviteCodeToKeep = authInviteCode.value.trim() || routeInviteCode.value
    const shareTypeToKeep = authShareType.value.trim() || routeShareType.value
    const shareTargetIdToKeep = authShareTargetId.value.trim() || routeShareTargetId.value
    resetAuthForm()
    const nextQuery: Record<string, string> = { modal: 'auth', mode }
    const normalizedRedirectTo = redirectTo.trim()
    if (
      normalizedRedirectTo &&
      normalizedRedirectTo.startsWith('/') &&
      !normalizedRedirectTo.startsWith('//')
    ) {
      nextQuery.redirect_to = normalizedRedirectTo
    }
    if (inviteCodeToKeep) {
      nextQuery.invite_code = inviteCodeToKeep
    }
    if (shareTypeToKeep) {
      nextQuery.share_type = shareTypeToKeep
    }
    if (shareTargetIdToKeep) {
      nextQuery.share_target_id = shareTargetIdToKeep
    }
    if (mode === 'register' && inviteCodeToKeep) {
      authInviteCode.value = inviteCodeToKeep
      authShareType.value = shareTypeToKeep
      authShareTargetId.value = shareTargetIdToKeep
    }
    router.push({ name: 'home', query: nextQuery })
  }

  function closeAuth() {
    acceptTerms.value = false
    router.replace({ name: 'home' })
  }

  async function sendAuthCode() {
    await sendAuthCodeAction()
  }

  async function submitAuth() {
    const result = await submitAuthAction()
    if (result) {
      acceptTerms.value = false
      if (authRedirectTarget.value) {
        void router.replace(authRedirectTarget.value)
        return
      }

      void router.replace({ name: 'home' })
      await options.refreshPortalData()
    }
  }

  /**
   * 离开首页时清掉表单状态（`useAuthForm` 的计时器清理在它自己的 `onBeforeUnmount` 里）。
   * 状态由本 composable 持有，就由它清 —— 视图那边不再单独记一笔。
   */
  onBeforeUnmount(() => {
    resetAuthForm()
  })

  const authModalBindings = computed(() => ({
    visible: authVisible.value,
    authMode: routeAuthMode.value,
    authTitle: authTitle.value,
    authUsername: authUsername.value,
    authPassword: authPassword.value,
    authEmail: authEmail.value,
    authEmailCode: authEmailCode.value,
    authInviteCode: authInviteCode.value,
    turnstileToken: authTurnstileToken.value,
    acceptTerms: acceptTerms.value,
    authLoading: auth.loading,
    loginRequiresTwoFactor: loginRequiresTwoFactor.value,
    githubLoginLoading: githubLoading.value,
    wechatLoginLoading: wechatLoginLoading.value,
    qqLoginLoading: qqLoginLoading.value,
    giteeLoginLoading: giteeLoading.value,
    githubLoginAvailable: githubAvailable.value,
    wechatLoginAvailable: wechatAvailable.value,
    qqLoginAvailable: qqAvailable.value,
    giteeLoginAvailable: giteeAvailable.value,
    sendCodeLoading: sendCodeLoading.value,
    sendCodeCountdown: sendCodeCountdown.value,
    onClose: closeAuth,
    onSubmit: submitAuth,
    onLoginWithGithub: loginWithGithub,
    onLoginWithWechat: loginWithWechat,
    onLoginWithQq: loginWithQq,
    onLoginWithGitee: loginWithGitee,
    onSendAuthCode: sendAuthCode,
    onChangeMode: openAuth,
    'onUpdate:authUsername': (value: string) => {
      authUsername.value = value
    },
    'onUpdate:authPassword': (value: string) => {
      authPassword.value = value
    },
    'onUpdate:authEmail': (value: string) => {
      authEmail.value = value
    },
    'onUpdate:authEmailCode': (value: string) => {
      authEmailCode.value = value
    },
    'onUpdate:authInviteCode': (value: string) => {
      authInviteCode.value = value
    },
    'onUpdate:turnstileToken': (value: string) => {
      authTurnstileToken.value = value
    },
    'onUpdate:acceptTerms': (value: boolean) => {
      acceptTerms.value = value
    },
  }))

  const wechatQrBindings = computed(() => ({
    visible: wechatQrLogin.visible,
    url: wechatQrLogin.url,
    state: wechatQrLogin.state,
    pollSecret: wechatQrLogin.pollSecret,
    onClose: closeWechatQrLogin,
    onRefresh: refreshWechatQrLogin,
    onLoggedIn: handleWechatQrToken,
  }))

  return { openAuth, authModalBindings, wechatQrBindings }
}
