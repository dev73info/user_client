<script setup lang="ts">
import type { PropType } from 'vue'

type AuthMode = 'login' | 'register' | 'reset'

const props = defineProps({
  visible: { type: Boolean, default: false },
  authMode: { type: String as PropType<AuthMode>, default: 'login' },
  authTitle: { type: String, required: true },
  authUsername: { type: String, default: '' },
  authPassword: { type: String, default: '' },
  authEmail: { type: String, default: '' },
  authEmailCode: { type: String, default: '' },
  acceptTerms: { type: Boolean, default: false },
  githubLoginLoading: { type: Boolean, default: false },
  sendCodeLoading: { type: Boolean, default: false },
  sendCodeCountdown: { type: Number, default: 0 },
  authLoading: { type: Boolean, default: false },
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submit'): void
  (e: 'loginWithGithub'): void
  (e: 'sendAuthCode'): void
  (e: 'change-mode', mode: 'login' | 'register' | 'reset'): void
  (e: 'update:authUsername', value: string): void
  (e: 'update:authPassword', value: string): void
  (e: 'update:authEmail', value: string): void
  (e: 'update:authEmailCode', value: string): void
  (e: 'update:acceptTerms', value: boolean): void
}>()

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

function updateAcceptTerms(event: Event) {
  emit('update:acceptTerms', (event.target as HTMLInputElement).checked)
}

function changeMode(mode: AuthMode) {
  emit('change-mode', mode)
}

function submitOnEnter() {
  if (props.authMode === 'login' && !props.authLoading) {
    emit('submit')
  }
}
</script>

<template>
  <div v-if="visible" class="auth-modal-wrap" @click.self="emit('close')">
    <section class="auth-modal" aria-label="认证弹窗">
      <h3>{{ authTitle }}</h3>

      <template v-if="authMode !== 'reset'">
        <label>
          用户名
          <input :value="authUsername" type="text" autocomplete="username" placeholder="请输入用户名" @input="updateUsername"
            @keydown.enter.prevent="submitOnEnter" />
        </label>
        <template v-if="authMode === 'register'">
          <label>
            邮箱
            <input :value="authEmail" type="email" autocomplete="email" placeholder="请输入注册邮箱" @input="updateEmail" />
          </label>
        </template>
      </template>
      <template v-else>
        <label>
          邮箱
          <input :value="authEmail" type="email" autocomplete="email" placeholder="请输入注册邮箱" @input="updateEmail" />
        </label>
      </template>

      <template v-if="authMode === 'login'">
        <label>
          密码
          <input :value="authPassword" type="password" autocomplete="current-password" placeholder="至少 6 位密码"
            @input="updatePassword" @keydown.enter.prevent="submitOnEnter" />
        </label>
        <div class="auth-forgot-row">
          <button class="auth-link" type="button" @click="changeMode('reset')">忘记密码？</button>
        </div>
      </template>

      <template v-if="authMode !== 'login'">
        <label>
          邮箱验证码
          <div class="inline-inputs auth-code-row">
            <input :value="authEmailCode" type="text" maxlength="6" placeholder="输入 6 位验证码" @input="updateEmailCode" />
            <button class="auth-btn ghost" type="button" :disabled="sendCodeLoading || sendCodeCountdown > 0"
              @click="emit('sendAuthCode')">
              {{ sendCodeLoading ? '发送中...' : sendCodeCountdown > 0 ? `${sendCodeCountdown}s` : '发送验证码' }}
            </button>
          </div>
        </label>

        <label>
          {{ authMode === 'register' ? '密码' : '新码' }}
          <input :value="authPassword" type="password" autocomplete="new-password" placeholder="至少 6 位新密码"
            @input="updatePassword" />
        </label>
      </template>

      <template v-if="authMode === 'register'">
        <div class="auth-agreement-row">
          <label class="checkbox-label">
            <input type="checkbox" :checked="acceptTerms" @change="updateAcceptTerms" />
            我已阅读并同意
            <router-link to="/terms">《用户协议》</router-link>、
            <router-link to="/privacy">《隐私政策》</router-link>和
            <router-link to="/payment-refund">《支付与退款说明》</router-link>
          </label>
        </div>
      </template>

      <div class="auth-modal-actions">
        <button class="auth-btn ghost" type="button" @click="emit('close')">取消</button>
        <button v-if="authMode === 'login'" class="auth-btn ghost" type="button" :disabled="githubLoginLoading"
          @click="emit('loginWithGithub')">
          {{ githubLoginLoading ? '跳转中...' : 'GitHub 快捷登录' }}
        </button>
        <button class="auth-btn solid" type="button"
          :disabled="authLoading || (authMode === 'register' && !acceptTerms)" @click="emit('submit')">
          {{ authLoading ? '登录中...' : authMode === 'login' ? '登录' : authMode === 'register' ? '注册并登录' : '重置密码' }}
        </button>
      </div>
    </section>
  </div>
</template>
