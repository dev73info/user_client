<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AuthModal from '@/components/AuthModal.vue'
import CouponClaimOutcome from '@/components/coupon/CouponClaimOutcome.vue'
import { claimActivityCampaign, type ActivityCampaignClaimResp } from '@/api/settings'
import { useAuthForm } from '@/composables/useAuthForm'
import { useAuthStore } from '@/stores/auth'
import { TMessage } from 'ui_73info'

type AuthMode = 'login' | 'register' | 'reset'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const authMode = ref<AuthMode>('login')
const authVisible = ref(false)
const claiming = ref(false)
const claimResult = ref<ActivityCampaignClaimResp | null>(null)
const claimError = ref('')
const claimCode = computed(() => String(route.query.code ?? '').trim())
const {
  authUsername,
  authPassword,
  authEmail,
  authEmailCode,
  authTurnstileToken,
  acceptTerms,
  loginRequiresTwoFactor,
  sendCodeLoading,
  sendCodeCountdown,
  githubLoading,
  wechatLoginLoading,
  qqLoginLoading,
  giteeLoading,
  githubAvailable,
  wechatAvailable,
  qqAvailable,
  giteeAvailable,
  resetAuthForm,
  loginWithGithub,
  loginWithWechat,
  loginWithQq,
  loginWithGitee,
  sendAuthCode,
  submitAuth,
  changeAuthMode,
} = useAuthForm(authMode)

const authTitle = computed(() => {
  if (authMode.value === 'login') {
    return '登录后领取活动福利'
  }
  if (authMode.value === 'register') {
    return '注册并领取活动福利'
  }
  return '重置密码并领取活动福利'
})

async function runClaim() {
  if (!claimCode.value) {
    claimError.value = '领取链接缺少领取码，请返回邮件重新点击。'
    return
  }

  if (!auth.isAuthed) {
    claimError.value = '请先登录与收件邮箱一致的账号后再领取。'
    return
  }

  claiming.value = true
  claimError.value = ''
  try {
    claimResult.value = await claimActivityCampaign(auth.token, claimCode.value)
  } catch (err) {
    const message = err instanceof Error ? err.message : '领取活动福利失败'
    claimError.value = message
    TMessage.error(message)
  } finally {
    claiming.value = false
  }
}

function openAuth(mode: AuthMode = 'login') {
  authMode.value = mode
  authVisible.value = true
}

function closeAuth() {
  authVisible.value = false
  resetAuthForm()
}

async function handleSubmitAuth() {
  const ok = await submitAuth()
  if (!ok) {
    return
  }

  closeAuth()
  await runClaim()
}

function goWorkbench() {
  void router.push({ name: 'workbench-account' })
}

onMounted(() => {
  auth.hydrate()
  if (!claimCode.value) {
    claimError.value = '领取链接无效，请检查邮件中的完整地址。'
    return
  }

  if (auth.isAuthed) {
    void runClaim()
  }
})
</script>

<template>
  <section class="claim-page">
    <div class="claim-page__panel">
      <h1>活动福利领取</h1>
      <p class="claim-page__lead">
        邮件里的活动链接会把券发到当前登录账号的背包。账号绑定邮箱必须和收件邮箱一致。
      </p>

      <CouponClaimOutcome
        :claiming="claiming"
        :result="claimResult"
        :error="claimError"
        :authed="auth.isAuthed"
        @workbench="goWorkbench"
        @claim="runClaim"
        @login="openAuth('login')"
        @register="openAuth('register')"
      />
    </div>

    <AuthModal
      :visible="authVisible"
      :authMode="authMode"
      :authTitle="authTitle"
      v-model:authUsername="authUsername"
      v-model:authPassword="authPassword"
      v-model:authEmail="authEmail"
      v-model:authEmailCode="authEmailCode"
      v-model:turnstileToken="authTurnstileToken"
      v-model:acceptTerms="acceptTerms"
      :authLoading="auth.loading"
      :loginRequiresTwoFactor="loginRequiresTwoFactor"
      :githubLoginLoading="githubLoading"
      :wechatLoginLoading="wechatLoginLoading"
      :qqLoginLoading="qqLoginLoading"
      :giteeLoginLoading="giteeLoading"
      :githubLoginAvailable="githubAvailable"
      :wechatLoginAvailable="wechatAvailable"
      :qqLoginAvailable="qqAvailable"
      :giteeLoginAvailable="giteeAvailable"
      :sendCodeLoading="sendCodeLoading"
      :sendCodeCountdown="sendCodeCountdown"
      @close="closeAuth"
      @submit="handleSubmitAuth"
      @loginWithGithub="loginWithGithub"
      @loginWithWechat="loginWithWechat"
      @loginWithQq="loginWithQq"
      @loginWithGitee="loginWithGitee"
      @sendAuthCode="sendAuthCode"
      @change-mode="changeAuthMode"
    />
  </section>
</template>

<style scoped>
.claim-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
}

.claim-page__panel {
  width: min(680px, 100%);
  padding: 36px;
  border: 1px solid rgba(140, 184, 255, 0.18);
  border-radius: 28px;
  background: rgba(6, 18, 34, 0.86);
  box-shadow: 0 24px 90px rgba(0, 0, 0, 0.34);
  color: #f4f7ff;
}

.claim-page h1 {
  margin: 0 0 12px;
  font-size: clamp(32px, 5vw, 46px);
}

.claim-page__lead {
  margin: 0 0 24px;
  color: rgba(244, 247, 255, 0.72);
  line-height: 1.8;
}

@media (max-width: 640px) {
  .claim-page__panel {
    padding: 24px;
  }
}
</style>
