<script setup lang="ts">
import { computed, ref } from 'vue'
import TurnstileWidget from '@/components/TurnstileWidget.vue'
import type { TurnstileSurfaceAction } from '@/shared/turnstile'
import KeyTermsNotice from '@/components/legal/KeyTermsNotice.vue'

import type { AuthModalMode } from './types'

/** 账号密码面板：按登录 / 注册 / 重置三种模式切换字段，含人机验证与协议勾选。 */
const props = defineProps({
  authMode: { type: String as () => AuthModalMode, required: true },
  authUsername: { type: String, default: '' },
  authPassword: { type: String, default: '' },
  authEmail: { type: String, default: '' },
  authEmailCode: { type: String, default: '' },
  authInviteCode: { type: String, default: '' },
  loginRequiresTwoFactor: { type: Boolean, default: false },
  acceptTerms: { type: Boolean, default: false },
  noticeAccepted: { type: Boolean, default: false },
  sendCodeLoading: { type: Boolean, default: false },
  sendCodeCountdown: { type: Number, default: 0 },
  authLoading: { type: Boolean, default: false },
  turnstileEnabled: { type: Boolean, default: false },
  turnstileAction: { type: String as () => TurnstileSurfaceAction, required: true },
  turnstileNonce: { type: Number, default: 0 },
  preferInAppOauth: { type: Boolean, default: false },
  showInAppOauthPanel: { type: Boolean, default: false },
})

const emit = defineEmits<{
  (e: 'submit'): void
  (e: 'sendAuthCode'): void
  (e: 'change-mode', mode: AuthModalMode): void
  (e: 'update:authUsername', value: string): void
  (e: 'update:authPassword', value: string): void
  (e: 'update:authEmail', value: string): void
  (e: 'update:authEmailCode', value: string): void
  (e: 'update:authInviteCode', value: string): void
  (e: 'update:acceptTerms', value: boolean): void
  (e: 'update:noticeAccepted', value: boolean): void
  (e: 'update:turnstileToken', value: string): void
  (e: 'notice-loaded', payload: { version: string; effective_at: string }): void
}>()

const authMode = computed(() => props.authMode)
const authUsername = computed(() => props.authUsername)
const authPassword = computed(() => props.authPassword)
const authEmail = computed(() => props.authEmail)
const authEmailCode = computed(() => props.authEmailCode)
const authInviteCode = computed(() => props.authInviteCode)
const loginRequiresTwoFactor = computed(() => props.loginRequiresTwoFactor)
const acceptTerms = computed(() => props.acceptTerms)
const noticeAccepted = computed(() => props.noticeAccepted)
const sendCodeLoading = computed(() => props.sendCodeLoading)
const sendCodeCountdown = computed(() => props.sendCodeCountdown)
const turnstileEnabled = computed(() => props.turnstileEnabled)
const turnstileAction = computed(() => props.turnstileAction)
const turnstileNonce = computed(() => props.turnstileNonce)
const preferInAppOauth = computed(() => props.preferInAppOauth)
const showInAppOauthPanel = computed(() => props.showInAppOauthPanel)
const showAccountPanel = true

const turnstileRef = ref<InstanceType<typeof TurnstileWidget> | null>(null)

/** 一次请求结束后由父级调用：Turnstile token 一次性，必须重新取一枚。 */
function resetTurnstile() {
  turnstileRef.value?.reset()
}

defineExpose({ resetTurnstile })

function requiresAgreement(): boolean {
  return props.authMode === 'login' || props.authMode === 'register'
}

function agreementSatisfied(): boolean {
  return !requiresAgreement() || (props.acceptTerms && props.noticeAccepted)
}

function canSubmitAuth(): boolean {
  return !props.authLoading && agreementSatisfied()
}

function submitOnEnter() {
  if (props.authMode === 'login' && canSubmitAuth()) {
    emit('submit')
  }
}

function changeMode(mode: AuthModalMode) {
  emit('change-mode', mode)
}

function updateUsername(event: Event) {
  emit('update:authUsername', (event.target as HTMLInputElement).value)
}

function updatePassword(event: Event) {
  emit('update:authPassword', (event.target as HTMLInputElement).value)
}

function updateEmail(event: Event) {
  emit('update:authEmail', (event.target as HTMLInputElement).value)
}

function updateEmailCode(event: Event) {
  emit('update:authEmailCode', (event.target as HTMLInputElement).value)
}

function updateInviteCode(event: Event) {
  emit('update:authInviteCode', (event.target as HTMLInputElement).value)
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
</script>

<template>
  <div class="auth-modal-body">
    <template v-if="authMode !== 'reset'">
      <label>
        {{ authMode === 'login' ? '用户名或邮箱' : '用户名' }}
        <input
          :value="authUsername"
          type="text"
          autocomplete="username"
          :placeholder="authMode === 'login' ? '请输入用户名或邮箱' : '请输入用户名'"
          @input="updateUsername"
          @keydown.enter.prevent="submitOnEnter"
        />
      </label>
      <template v-if="authMode === 'register'">
        <label>
          邮箱
          <input
            :value="authEmail"
            type="email"
            autocomplete="email"
            placeholder="请输入注册邮箱"
            @input="updateEmail"
          />
        </label>
        <label>
          邀请码
          <input
            :value="authInviteCode"
            type="text"
            maxlength="32"
            autocomplete="off"
            placeholder="可选"
            @input="updateInviteCode"
          />
        </label>
      </template>
    </template>
    <template v-else>
      <label>
        邮箱
        <input
          :value="authEmail"
          type="email"
          autocomplete="email"
          placeholder="请输入注册邮箱"
          @input="updateEmail"
        />
      </label>
    </template>

    <template v-if="authMode === 'login'">
      <label>
        密码
        <input
          :value="authPassword"
          type="password"
          autocomplete="current-password"
          placeholder="至少 6 位密码"
          @input="updatePassword"
          @keydown.enter.prevent="submitOnEnter"
        />
      </label>
      <label v-if="loginRequiresTwoFactor">
        邮箱验证码
        <div class="inline-inputs auth-code-row">
          <input
            :value="authEmailCode"
            type="text"
            maxlength="6"
            placeholder="输入 6 位验证码"
            @input="updateEmailCode"
            @keydown.enter.prevent="submitOnEnter"
          />
          <button
            class="auth-btn ghost"
            type="button"
            :disabled="sendCodeLoading || sendCodeCountdown > 0"
            @click="emit('sendAuthCode')"
          >
            {{
              sendCodeLoading
                ? '发送中...'
                : sendCodeCountdown > 0
                  ? `${sendCodeCountdown}s`
                  : '重新发送'
            }}
          </button>
        </div>
      </label>
    </template>

    <template v-if="authMode !== 'login'">
      <label>
        邮箱验证码
        <div class="inline-inputs auth-code-row">
          <input
            :value="authEmailCode"
            type="text"
            maxlength="6"
            placeholder="输入 6 位验证码"
            @input="updateEmailCode"
          />
          <button
            class="auth-btn ghost"
            type="button"
            :disabled="sendCodeLoading || sendCodeCountdown > 0"
            @click="emit('sendAuthCode')"
          >
            {{
              sendCodeLoading
                ? '发送中...'
                : sendCodeCountdown > 0
                  ? `${sendCodeCountdown}s`
                  : '发送验证码'
            }}
          </button>
        </div>
      </label>

      <label>
        {{ authMode === 'register' ? '密码' : '新码' }}
        <input
          :value="authPassword"
          type="password"
          autocomplete="new-password"
          placeholder="至少 6 位新密码"
          @input="updatePassword"
        />
      </label>
    </template>

    <!-- 人机验证与「忘记密码？」同一行：控件在左、链接在右、垂直居中；
         注册 / 重置态没有该链接，仅保留左侧控件，行位置与登录态一致 -->
    <div class="auth-turnstile-row">
      <TurnstileWidget
        v-if="turnstileEnabled"
        ref="turnstileRef"
        :key="`${turnstileAction}-${turnstileNonce}`"
        :action="turnstileAction"
        class="auth-turnstile-row__widget"
        @update:token="emit('update:turnstileToken', $event)"
      />
      <div v-if="authMode === 'login'" class="auth-turnstile-row__actions">
        <button class="auth-link" type="button" @click="changeMode('reset')">忘记密码？</button>
        <button
          v-if="preferInAppOauth"
          class="auth-link"
          type="button"
          @click="changeMode('register')"
        >
          注册
        </button>
      </div>
    </div>

    <!-- 账号面板协议：端内用紧凑一行；普通浏览器保留完整文案卡片 -->
    <template
      v-if="
        (authMode === 'register' || authMode === 'login') &&
        showAccountPanel &&
        !showInAppOauthPanel
      "
    >
      <div class="auth-agreement-row" :class="{ 'auth-agreement-row--compact': preferInAppOauth }">
        <label class="checkbox-label">
          <input
            class="checkbox-input"
            type="checkbox"
            :checked="acceptTerms"
            @change="updateAcceptTerms"
          />
          <template v-if="preferInAppOauth">
            <span class="auth-agreement-row__text">
              同意
              <router-link to="/terms">用户协议</router-link>、
              <router-link to="/privacy">隐私政策</router-link>
              与
              <router-link to="/payment-refund">支付说明</router-link>
            </span>
          </template>
          <template v-else>
            <span class="checkbox-text">我已阅读并同意</span>
            <span class="agreement-links">
              <router-link to="/terms">《用户协议》</router-link>
              <span>、</span>
              <router-link to="/privacy">《隐私政策》</router-link>
              <span>和</span>
              <router-link to="/payment-refund">《支付与退款说明》</router-link>
            </span>
          </template>
        </label>
      </div>

      <KeyTermsNotice
        code="user_service_agreement"
        fallback-href="/terms"
        @loaded="onNoticeLoaded"
      />

      <div class="auth-agreement-row">
        <label class="checkbox-label">
          <input
            class="checkbox-input"
            type="checkbox"
            data-testid="legal-notice-check"
            :checked="noticeAccepted"
            @change="updateNoticeAccepted"
          />
          <span class="checkbox-text">我已阅读并理解上述重要条款提示</span>
        </label>
      </div>
    </template>
  </div>
</template>
