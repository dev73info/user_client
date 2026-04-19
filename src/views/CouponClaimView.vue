<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppToast from '@/components/AppToast.vue'
import AuthModal from '@/components/AuthModal.vue'
import { claimActivityCampaign, type ActivityCampaignClaimResp } from '@/api/settings'
import { useAuthForm } from '@/composables/useAuthForm'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'

type AuthMode = 'login' | 'register' | 'reset'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const { toastVisible, toastMessage, toastType, showToast, hideToast } = useToast()
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
  acceptTerms,
  sendCodeLoading,
  sendCodeCountdown,
  resetAuthForm,
  loginWithGithub,
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
    showToast(message, 'error')
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

function goProfile() {
  void router.push({ name: 'profile' })
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
      <p class="claim-page__eyebrow">73Info Activity</p>
      <h1>活动福利领取</h1>
      <p class="claim-page__lead">邮件里的活动链接会把券发到当前登录账号的背包。账号绑定邮箱必须和收件邮箱一致。</p>

      <div v-if="claiming" class="claim-page__state claim-page__state--loading">
        正在校验活动并发放福利，请稍候...
      </div>

      <div v-else-if="claimResult" class="claim-page__result">
        <strong>{{ claimResult.already_claimed ? '这份福利你已经领过了' : '领取成功' }}</strong>
        <p>活动：{{ claimResult.title }}</p>
        <p>券类型：{{ claimResult.coupon_type === 'amount' ? '优惠券' : '折扣券' }}</p>
        <p>券名称：{{ claimResult.coupon_name }}</p>
        <p>券码：{{ claimResult.assigned_coupon_code }}</p>
        <p>领取时间：{{ claimResult.claimed_at }}</p>
        <div class="claim-page__actions">
          <button class="claim-page__primary" type="button" @click="goProfile">前往个人中心查看</button>
        </div>
      </div>

      <div v-else class="claim-page__result claim-page__result--empty">
        <strong>尚未领取</strong>
        <p>{{ claimError || '点击下方按钮登录后继续领取。' }}</p>
        <div class="claim-page__actions">
          <button v-if="!auth.isAuthed" class="claim-page__primary" type="button"
            @click="openAuth('login')">登录后领取</button>
          <button v-else class="claim-page__primary" type="button" @click="runClaim">重新尝试领取</button>
          <button v-if="!auth.isAuthed" class="claim-page__ghost" type="button"
            @click="openAuth('register')">注册新账号</button>
        </div>
      </div>
    </div>

    <AuthModal :visible="authVisible" :authMode="authMode" :authTitle="authTitle" v-model:authUsername="authUsername"
      v-model:authPassword="authPassword" v-model:authEmail="authEmail" v-model:authEmailCode="authEmailCode"
      v-model:acceptTerms="acceptTerms" :authLoading="auth.loading" :sendCodeLoading="sendCodeLoading"
      :sendCodeCountdown="sendCodeCountdown" @close="closeAuth" @submit="handleSubmitAuth"
      @github-login="loginWithGithub" @send-code="sendAuthCode" @change-mode="changeAuthMode" />
    <AppToast :visible="toastVisible" :message="toastMessage" :type="toastType" @close="hideToast" />
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

.claim-page__eyebrow {
  margin: 0 0 14px;
  color: #8fc5ff;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-size: 12px;
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

.claim-page__state,
.claim-page__result {
  padding: 20px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.05);
}

.claim-page__state--loading {
  color: #9fd8ff;
}

.claim-page__result strong {
  display: block;
  margin-bottom: 12px;
  font-size: 22px;
}

.claim-page__result p {
  margin: 8px 0;
  color: rgba(244, 247, 255, 0.82);
}

.claim-page__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 20px;
}

.claim-page__primary,
.claim-page__ghost {
  border: none;
  border-radius: 999px;
  padding: 12px 22px;
  font: inherit;
  cursor: pointer;
}

.claim-page__primary {
  background: linear-gradient(135deg, #8bd0ff, #4ba7ff);
  color: #04111f;
  font-weight: 700;
}

.claim-page__ghost {
  background: transparent;
  color: #dfe9ff;
  border: 1px solid rgba(223, 233, 255, 0.24);
}

@media (max-width: 640px) {
  .claim-page__panel {
    padding: 24px;
  }

  .claim-page__actions {
    flex-direction: column;
  }
}
</style>
