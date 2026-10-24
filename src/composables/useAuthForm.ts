import type { Ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

import { useAuthProviders } from './authForm/providers'
import { useQqLogin } from './authForm/qq'
import { useAuthFormState } from './authForm/state'
import type { AuthMode } from './authForm/state'
import { useAuthSubmit } from './authForm/submit'
import { useWechatLogin } from './authForm/wechat'

/**
 * 登录 / 注册 / 重置表单：状态、验证码、快捷登录与提交。
 *
 * 实现按渠道分在 `authForm/` 下（表单状态、GitHub/Gitee、微信、QQ、提交），这里只做组装，
 * 返回的对象形状与拆之前完全一致，调用方无需改动。
 */
export function useAuthForm(mode: Ref<AuthMode>) {
  const auth = useAuthStore()
  const router = useRouter()

  const state = useAuthFormState()
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
    resetAuthForm,
  } = state

  const {
    githubLoading,
    giteeLoading,
    githubAvailable,
    wechatAvailable,
    qqAvailable,
    giteeAvailable,
    loadOauthStatus,
    loginWithGithub,
    loginWithGitee,
  } = useAuthProviders({ auth, router, acceptTerms })

  const {
    wechatLoginLoading,
    wechatQrLogin,
    loginWithWechat,
    closeWechatQrLogin,
    refreshWechatQrLogin,
    handleWechatQrToken,
  } = useWechatLogin({ auth, router, acceptTerms })

  const { qqLoginLoading, loginWithQq } = useQqLogin({ auth, router, acceptTerms })

  const { sendAuthCode, submitAuth } = useAuthSubmit({ mode, auth, state })

  function changeAuthMode(modeValue: AuthMode) {
    mode.value = modeValue
    loginRequiresTwoFactor.value = false
    authEmailCode.value = ''
  }

  void loadOauthStatus()

  return {
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
    loadOauthStatus,
    resetAuthForm,
    loginWithGithub,
    loginWithGitee,
    loginWithWechat,
    sendAuthCode,
    submitAuth,
    changeAuthMode,
    wechatQrLogin,
    closeWechatQrLogin,
    refreshWechatQrLogin,
    handleWechatQrToken,
    loginWithQq,
  }
}
