<script setup lang="ts">
import { computed } from 'vue'
import KeyTermsNotice from '@/components/legal/KeyTermsNotice.vue'

import type { InAppOauthProvider } from './types'

/** 端内（微信 / QQ）一键登录面板：主按钮 + 协议与重要条款提示两个勾选。 */
const props = defineProps({
  provider: { type: String as () => InAppOauthProvider, required: true },
  wechatLoginLoading: { type: Boolean, default: false },
  qqLoginLoading: { type: Boolean, default: false },
  acceptTerms: { type: Boolean, default: false },
  noticeAccepted: { type: Boolean, default: false },
})

const emit = defineEmits<{
  (e: 'update:acceptTerms', value: boolean): void
  (e: 'update:noticeAccepted', value: boolean): void
  (e: 'notice-loaded', payload: { version: string; effective_at: string }): void
  (e: 'loginWithWechat'): void
  (e: 'loginWithQq'): void
}>()

const qqLoginIconImage = '/icons/qq_loge.png'

const inAppOauthProvider = computed(() => props.provider)
const wechatLoginLoading = computed(() => props.wechatLoginLoading)
const qqLoginLoading = computed(() => props.qqLoginLoading)
const acceptTerms = computed(() => props.acceptTerms)
const noticeAccepted = computed(() => props.noticeAccepted)

/** 两个勾选都满足才允许一键登录（协议同意 + 已读重要条款提示）。 */
function agreementSatisfied(): boolean {
  return props.acceptTerms && props.noticeAccepted
}

function updateAcceptTerms(event: Event) {
  emit('update:acceptTerms', (event.target as HTMLInputElement).checked)
}

function updateNoticeAccepted(event: Event) {
  emit('update:noticeAccepted', (event.target as HTMLInputElement).checked)
}

function onNoticeLoaded(payload: { version: string; effective_at: string }) {
  emit('notice-loaded', payload)
}

function emitInAppOauth() {
  if (props.provider === 'wechat') {
    emit('loginWithWechat')
    return
  }
  emit('loginWithQq')
}
</script>

<template>
  <!-- 端内：默认只展示一键登录；账号密码由标题旁按钮切入 -->
  <div class="auth-inapp-login" aria-label="端内一键登录">
    <button
      class="auth-btn auth-login-method auth-inapp-login__btn"
      :class="inAppOauthProvider === 'wechat' ? 'auth-inapp-login__btn--wechat' : 'auth-qq-login'"
      type="button"
      :disabled="
        (inAppOauthProvider === 'wechat' ? wechatLoginLoading : qqLoginLoading) ||
        !agreementSatisfied()
      "
      :aria-busy="inAppOauthProvider === 'wechat' ? wechatLoginLoading : qqLoginLoading"
      :aria-label="inAppOauthProvider === 'wechat' ? '使用微信一键登录' : '使用QQ一键登录'"
      @click="emitInAppOauth"
    >
      <img
        class="auth-login-method__icon"
        :src="inAppOauthProvider === 'wechat' ? '/icons/wechat.svg' : qqLoginIconImage"
        alt=""
        aria-hidden="true"
      />
      <span v-if="inAppOauthProvider === 'wechat'">
        {{ wechatLoginLoading ? '跳转中...' : '微信一键登录' }}
      </span>
      <span v-else>
        {{ qqLoginLoading ? '跳转中...' : 'QQ一键登录' }}
      </span>
    </button>

    <div class="auth-agreement-row auth-agreement-row--compact">
      <label class="checkbox-label">
        <input
          class="checkbox-input"
          type="checkbox"
          :checked="acceptTerms"
          @change="updateAcceptTerms"
        />
        <span class="auth-agreement-row__text">
          同意
          <router-link to="/terms">用户协议</router-link>、
          <router-link to="/privacy">隐私政策</router-link>
          与
          <router-link to="/payment-refund">支付说明</router-link>
        </span>
      </label>
    </div>

    <KeyTermsNotice code="user_service_agreement" fallback-href="/terms" @loaded="onNoticeLoaded" />

    <div class="auth-agreement-row auth-agreement-row--compact">
      <label class="checkbox-label">
        <input
          class="checkbox-input"
          type="checkbox"
          data-testid="legal-notice-check"
          :checked="noticeAccepted"
          @change="updateNoticeAccepted"
        />
        <span class="auth-agreement-row__text">我已阅读并理解上述重要条款提示</span>
      </label>
    </div>
  </div>
</template>
