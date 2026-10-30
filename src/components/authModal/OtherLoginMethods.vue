<script setup lang="ts">
import { computed } from 'vue'

/** 底部「其他方式登录」：GitHub / 微信 / QQ / Gitee 四个快捷登录按钮。 */
const props = defineProps({
  githubLoginAvailable: { type: Boolean, default: true },
  wechatLoginAvailable: { type: Boolean, default: true },
  qqLoginAvailable: { type: Boolean, default: true },
  giteeLoginAvailable: { type: Boolean, default: false },
  githubLoginLoading: { type: Boolean, default: false },
  wechatLoginLoading: { type: Boolean, default: false },
  qqLoginLoading: { type: Boolean, default: false },
  giteeLoginLoading: { type: Boolean, default: false },
  authMode: { type: String, required: true },
  acceptTerms: { type: Boolean, default: false },
  preferInAppOauth: { type: Boolean, default: false },
})

const emit = defineEmits<{
  (e: 'loginWithGithub'): void
  (e: 'loginWithWechat'): void
  (e: 'loginWithQq'): void
  (e: 'loginWithGitee'): void
}>()

const qqLoginIconImage = '/icons/qq_loge.png'

const githubLoginLoading = computed(() => props.githubLoginLoading)
const wechatLoginLoading = computed(() => props.wechatLoginLoading)
const qqLoginLoading = computed(() => props.qqLoginLoading)
const giteeLoginLoading = computed(() => props.giteeLoginLoading)

const showGithubLogin = computed(
  () => props.authMode === 'login' && props.githubLoginAvailable && !props.preferInAppOauth,
)
const showWechatLogin = computed(
  () => props.authMode === 'login' && props.wechatLoginAvailable && !props.preferInAppOauth,
)
const showQqLogin = computed(
  () => props.authMode === 'login' && props.qqLoginAvailable && !props.preferInAppOauth,
)
const showGiteeLogin = computed(
  () => props.authMode === 'login' && props.giteeLoginAvailable && !props.preferInAppOauth,
)
/** 快捷登录同样只需勾「同意协议」；重要条款提示已于 #52 下线，别再加第二个勾选。 */
function agreementSatisfied(): boolean {
  return props.acceptTerms
}
</script>

<template>
  <div class="auth-login-methods" aria-label="第三方登录方式">
    <div class="auth-login-divider">
      <span>其他方式登录</span>
    </div>
    <button
      v-if="showGithubLogin"
      class="auth-btn ghost auth-login-method"
      type="button"
      :disabled="githubLoginLoading || !agreementSatisfied()"
      @click="emit('loginWithGithub')"
    >
      <img class="auth-login-method__icon" src="/icons/github.svg" alt="" aria-hidden="true" />
      <span>{{ githubLoginLoading ? '跳转中...' : 'GitHub 快捷登录' }}</span>
    </button>
    <button
      v-if="showWechatLogin"
      class="auth-btn ghost auth-login-method"
      type="button"
      :disabled="wechatLoginLoading || !agreementSatisfied()"
      @click="emit('loginWithWechat')"
    >
      <img class="auth-login-method__icon" src="/icons/wechat.svg" alt="" aria-hidden="true" />
      <span>{{ wechatLoginLoading ? '跳转中...' : '微信快捷登录' }}</span>
    </button>
    <button
      v-if="showQqLogin"
      class="auth-btn ghost auth-login-method auth-qq-login"
      type="button"
      :aria-busy="qqLoginLoading"
      aria-label="使用QQ登录"
      :disabled="qqLoginLoading || !agreementSatisfied()"
      @click="emit('loginWithQq')"
    >
      <img class="auth-login-method__icon" :src="qqLoginIconImage" alt="" aria-hidden="true" />
      <span>{{ qqLoginLoading ? '跳转中...' : 'QQ快捷登录' }}</span>
    </button>
    <button
      v-if="showGiteeLogin"
      class="auth-btn ghost auth-login-method auth-gitee-login"
      type="button"
      :aria-busy="giteeLoginLoading"
      aria-label="使用Gitee登录"
      :disabled="giteeLoginLoading || !agreementSatisfied()"
      @click="emit('loginWithGitee')"
    >
      <img class="auth-login-method__icon" src="/icons/gitee.svg" alt="" aria-hidden="true" />
      <span>{{ giteeLoginLoading ? '跳转中...' : 'Gitee快捷登录' }}</span>
    </button>
  </div>
</template>
