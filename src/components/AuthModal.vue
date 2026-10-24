<script setup lang="ts">
import { computed, ref, watch, type PropType } from 'vue'
import { isQqBrowser, isWechatBrowser } from '@/shared/auth/browser'
import { isTurnstileEnabled, type TurnstileSurfaceAction } from '@/shared/turnstile'
import { detectClientPlatform, recordAgreementAcceptance } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import AccountForm from '@/components/authModal/AccountForm.vue'
import AuthModalHead from '@/components/authModal/AuthModalHead.vue'
import InAppLoginPanel from '@/components/authModal/InAppLoginPanel.vue'
import OtherLoginMethods from '@/components/authModal/OtherLoginMethods.vue'
import type { AuthModalMode, InAppOauthProvider } from '@/components/authModal/types'
import {
  clearLegalNoticeConfirmedAt,
  readLegalNoticeConfirmedAt,
  rememberLegalNoticeConfirmedAt,
} from '@/components/legal/legalNotice'

type AuthMode = AuthModalMode
/** 端内登录面板：一键授权 / 账号密码，互斥展示 */
type InAppLoginPanel = 'oauth' | 'account'

const props = defineProps({
  visible: { type: Boolean, default: false },
  authMode: { type: String as PropType<AuthMode>, default: 'login' },
  authTitle: { type: String, required: true },
  authUsername: { type: String, default: '' },
  authPassword: { type: String, default: '' },
  authEmail: { type: String, default: '' },
  authEmailCode: { type: String, default: '' },
  authInviteCode: { type: String, default: '' },
  loginRequiresTwoFactor: { type: Boolean, default: false },
  acceptTerms: { type: Boolean, default: false },
  githubLoginLoading: { type: Boolean, default: false },
  wechatLoginLoading: { type: Boolean, default: false },
  qqLoginLoading: { type: Boolean, default: false },
  giteeLoginLoading: { type: Boolean, default: false },
  githubLoginAvailable: { type: Boolean, default: true },
  wechatLoginAvailable: { type: Boolean, default: true },
  qqLoginAvailable: { type: Boolean, default: true },
  giteeLoginAvailable: { type: Boolean, default: false },
  sendCodeLoading: { type: Boolean, default: false },
  sendCodeCountdown: { type: Number, default: 0 },
  authLoading: { type: Boolean, default: false },
  turnstileToken: { type: String, default: '' },
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submit'): void
  (e: 'loginWithGithub'): void
  (e: 'loginWithWechat'): void
  (e: 'loginWithQq'): void
  (e: 'loginWithGitee'): void
  (e: 'sendAuthCode'): void
  (e: 'change-mode', mode: 'login' | 'register' | 'reset'): void
  (e: 'update:authUsername', value: string): void
  (e: 'update:authPassword', value: string): void
  (e: 'update:authEmail', value: string): void
  (e: 'update:authEmailCode', value: string): void
  (e: 'update:authInviteCode', value: string): void
  (e: 'update:acceptTerms', value: boolean): void
  (e: 'update:turnstileToken', value: string): void
}>()

/**
 * 微信 / QQ 内打开且对应快捷登录可用时，登录态优先展示端内一键登录；
 * 两边都匹配时优先微信（MicroMessenger 更明确）。
 */
const inAppOauthProvider = computed<InAppOauthProvider | null>(() => {
  if (props.authMode !== 'login') return null
  if (isWechatBrowser() && props.wechatLoginAvailable) return 'wechat'
  if (isQqBrowser() && props.qqLoginAvailable) return 'qq'
  return null
})

const preferInAppOauth = computed(() => inAppOauthProvider.value !== null)

/** 端内默认一键登录；点标题旁按钮可切到账号密码，两者不同时铺开。 */
const inAppLoginPanel = ref<InAppLoginPanel>('oauth')

watch(
  () => [props.visible, preferInAppOauth.value] as const,
  ([visible, inApp]) => {
    if (visible && inApp) {
      inAppLoginPanel.value = 'oauth'
    }
  },
  { immediate: true },
)

const showInAppOauthPanel = computed(
  () => preferInAppOauth.value && inAppLoginPanel.value === 'oauth',
)
const showAccountPanel = computed(
  () => !preferInAppOauth.value || inAppLoginPanel.value === 'account',
)

// ── Cloudflare Turnstile 人机验证 ─────────────────────────────────────────────
// 站点密钥来自 VITE_TURNSTILE_SITE_KEY：未配置时整块不渲染，后端也应对应关闭校验
// （backend_73info/config/local.toml 的 [turnstile] enabled）。
// 挂件本体在 `authModal/AccountForm.vue` 里，这里只保留动作名与重建用的 nonce。
const turnstileEnabled = isTurnstileEnabled()
const accountFormRef = ref<InstanceType<typeof AccountForm> | null>(null)
/** 换入口 / 重开弹窗时递增，用 :key 强制重建挂件，避免沿用旧动作名下已消费的 token。 */
const turnstileNonce = ref(0)

/** 动作名必须与后端 turnstile::guard 的 expected_action 一一对应。 */
const turnstileAction = computed<TurnstileSurfaceAction>(() =>
  props.authMode === 'reset' ? 'reset_password' : props.authMode,
)

watch(
  () => props.authMode,
  () => {
    emit('update:turnstileToken', '')
    turnstileNonce.value += 1
  },
)

// 一次请求结束后 token 已被后端消费（Turnstile token 一次性），必须重新取一枚，
// 否则下一次提交必然被拒。authLoading 覆盖登录 / 注册 / 重置，sendCodeLoading 覆盖发码。
watch(
  () => [props.authLoading, props.sendCodeLoading] as const,
  (now, prev) => {
    const wasBusy = Boolean(prev?.[0]) || Boolean(prev?.[1])
    const isBusy = Boolean(now[0]) || Boolean(now[1])
    if (wasBusy && !isBusy) {
      accountFormRef.value?.resetTurnstile()
    }
  },
)

watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      emit('update:turnstileToken', '')
      turnstileNonce.value += 1
    }
  },
)

/** 端内一键登录时标题不再写「登录账号」，避免与主按钮、底栏「登录」叠三层「登录」。 */
const displayTitle = computed(() => {
  if (preferInAppOauth.value) return '欢迎登录'
  return props.authTitle
})

const inAppPanelSwitchLabel = computed(() => {
  if (inAppLoginPanel.value === 'oauth') return '账号登录'
  return inAppOauthProvider.value === 'qq' ? 'QQ登录' : '一键登录'
})

function toggleInAppLoginPanel() {
  inAppLoginPanel.value = inAppLoginPanel.value === 'oauth' ? 'account' : 'oauth'
}

// 端内已置顶一键登录时，底部「其他方式」整块收起（微信里也不再露出 QQ / GitHub）。
const showGithubLogin = computed(
  () => props.authMode === 'login' && props.githubLoginAvailable && !preferInAppOauth.value,
)
const showWechatLogin = computed(
  () => props.authMode === 'login' && props.wechatLoginAvailable && !preferInAppOauth.value,
)
const showQqLogin = computed(
  () => props.authMode === 'login' && props.qqLoginAvailable && !preferInAppOauth.value,
)
const showGiteeLogin = computed(
  () => props.authMode === 'login' && props.giteeLoginAvailable && !preferInAppOauth.value,
)
const showOtherLoginMethods = computed(
  () => showGithubLogin.value || showWechatLogin.value || showQqLogin.value || showGiteeLogin.value,
)

// ── 重要条款提示与二次确认（R043 任务-03）─────────────────────────────────
// 《民法典》第 496 条要求格式条款提供方对免责、责任限制等条款履行提示说明义务。
// 现在只有一个「我已阅读并同意」的勾选框，重点条款没有任何单独提示，
// 所以这里加一个**独立**的"已阅读并理解重要条款提示"勾选框，两个都勾上才能提交。
const auth = useAuthStore()
/** "已阅读并理解重要条款提示"的勾选状态；每次打开弹窗都要重新勾。 */
const noticeAccepted = ref(false)
/** 提示组件读到的协议版本号（留痕用；读不到时后端会回落到模板当前版本）。 */
const noticeVersion = ref('')

/** 勾选状态不跨会话：打开弹窗即重置，避免"上次勾过就一直算同意"。 */
watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      noticeAccepted.value = false
      return
    }
    // 弹窗关闭：登录成功的话补记一次协议同意留痕
    // （留痕接口要登录态，只能登录成功后再补）。
    void recordLoginAcceptance()
  },
)

/** 记录"已阅读重要条款提示"的时间到本次会话。 */
function updateNoticeAccepted(value: boolean) {
  noticeAccepted.value = value
  if (noticeAccepted.value) {
    rememberLegalNoticeConfirmedAt(new Date().toISOString())
    return
  }
  clearLegalNoticeConfirmedAt()
}

function onNoticeLoaded(payload: { version: string; effective_at: string }) {
  noticeVersion.value = payload.version
}

/** 登录 / 注册成功后补记一次协议同意留痕。 */
async function recordLoginAcceptance() {
  const confirmedAt = readLegalNoticeConfirmedAt()
  if (!confirmedAt) return
  if (!auth.token || !auth.isAuthed) return
  // ⚠️ 已知缺口：第三方快捷登录（GitHub / 微信 / QQ / Gitee）与端内一键登录是**整页跳转**，
  // 弹窗在跳转前就消失了，回来时用户已登录但这里没有再触发一次。
  // 这条路径的提示确认时间仍留在本次会话里（sessionStorage 跨跳转保留），
  // 用户之后打开协议页或签署页时会带上提示信息补记；真正的修法要在 OAuth 回跳处补一刀
  // （router / HomeView），不在本次任务允许改动的文件范围内。
  try {
    await recordAgreementAcceptance(
      auth.token,
      'user_service_agreement',
      noticeVersion.value,
      detectClientPlatform(),
      'auth',
    )
  } catch {
    // 留痕失败不阻断登录流程：用户已经登录成功，留痕是补记。
  } finally {
    clearLegalNoticeConfirmedAt()
  }
}

function requiresAgreement(): boolean {
  return props.authMode === 'login' || props.authMode === 'register'
}

/** 两个勾选都满足才允许提交（协议同意 + 已读重要条款提示）。 */
function agreementSatisfied(): boolean {
  return !requiresAgreement() || (props.acceptTerms && noticeAccepted.value)
}

function canSubmitAuth(): boolean {
  return !props.authLoading && agreementSatisfied()
}
</script>

<template>
  <div v-if="visible" class="auth-modal-wrap" @click.self="emit('close')">
    <section
      class="auth-modal"
      :class="{
        'auth-modal--inapp-oauth': preferInAppOauth,
        'auth-modal--inapp-oauth-panel': showInAppOauthPanel,
        'auth-modal--inapp-account-panel': preferInAppOauth && showAccountPanel,
      }"
      aria-label="认证弹窗"
    >
      <AuthModalHead
        :title="displayTitle"
        :prefer-in-app-oauth="preferInAppOauth"
        :in-app-panel-switch-label="inAppPanelSwitchLabel"
        :auth-mode="authMode"
        @toggle-panel="toggleInAppLoginPanel"
        @change-mode="emit('change-mode', $event)"
      />
      <InAppLoginPanel
        v-if="showInAppOauthPanel"
        :provider="inAppOauthProvider ?? 'wechat'"
        :wechat-login-loading="wechatLoginLoading"
        :qq-login-loading="qqLoginLoading"
        :accept-terms="acceptTerms"
        :notice-accepted="noticeAccepted"
        @update:accept-terms="emit('update:acceptTerms', $event)"
        @update:notice-accepted="updateNoticeAccepted"
        @notice-loaded="onNoticeLoaded"
        @login-with-wechat="emit('loginWithWechat')"
        @login-with-qq="emit('loginWithQq')"
      />

      <AccountForm
        v-if="showAccountPanel"
        ref="accountFormRef"
        :auth-mode="authMode"
        :auth-username="authUsername"
        :auth-password="authPassword"
        :auth-email="authEmail"
        :auth-email-code="authEmailCode"
        :auth-invite-code="authInviteCode"
        :login-requires-two-factor="loginRequiresTwoFactor"
        :accept-terms="acceptTerms"
        :notice-accepted="noticeAccepted"
        :send-code-loading="sendCodeLoading"
        :send-code-countdown="sendCodeCountdown"
        :auth-loading="authLoading"
        :turnstile-enabled="turnstileEnabled"
        :turnstile-action="turnstileAction"
        :turnstile-nonce="turnstileNonce"
        :prefer-in-app-oauth="preferInAppOauth"
        :show-in-app-oauth-panel="showInAppOauthPanel"
        @submit="emit('submit')"
        @send-auth-code="emit('sendAuthCode')"
        @change-mode="emit('change-mode', $event)"
        @update:auth-username="emit('update:authUsername', $event)"
        @update:auth-password="emit('update:authPassword', $event)"
        @update:auth-email="emit('update:authEmail', $event)"
        @update:auth-email-code="emit('update:authEmailCode', $event)"
        @update:auth-invite-code="emit('update:authInviteCode', $event)"
        @update:accept-terms="emit('update:acceptTerms', $event)"
        @update:notice-accepted="updateNoticeAccepted"
        @update:turnstile-token="emit('update:turnstileToken', $event)"
        @notice-loaded="onNoticeLoaded"
      />

      <OtherLoginMethods
        v-if="showOtherLoginMethods"
        :auth-mode="authMode"
        :github-login-available="githubLoginAvailable"
        :wechat-login-available="wechatLoginAvailable"
        :qq-login-available="qqLoginAvailable"
        :gitee-login-available="giteeLoginAvailable"
        :github-login-loading="githubLoginLoading"
        :wechat-login-loading="wechatLoginLoading"
        :qq-login-loading="qqLoginLoading"
        :gitee-login-loading="giteeLoginLoading"
        :accept-terms="acceptTerms"
        :notice-accepted="noticeAccepted"
        :prefer-in-app-oauth="preferInAppOauth"
        @login-with-github="emit('loginWithGithub')"
        @login-with-wechat="emit('loginWithWechat')"
        @login-with-qq="emit('loginWithQq')"
        @login-with-gitee="emit('loginWithGitee')"
      />

      <div
        class="auth-modal-actions"
        :class="{ 'auth-modal-actions--single': showInAppOauthPanel }"
      >
        <button class="auth-btn ghost" type="button" @click="emit('close')">取消</button>
        <button
          v-if="showAccountPanel"
          class="auth-btn solid"
          type="button"
          :disabled="!canSubmitAuth()"
          @click="emit('submit')"
        >
          {{
            authLoading
              ? '登录中...'
              : authMode === 'login'
                ? loginRequiresTwoFactor
                  ? '验证并登录'
                  : '登录'
                : authMode === 'register'
                  ? '注册并登录'
                  : '重置密码'
          }}
        </button>
      </div>
    </section>
  </div>
</template>
