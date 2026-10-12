<script setup lang="ts">
import { computed, ref, watch, type PropType } from 'vue'
import { isQqBrowser, isWechatBrowser } from '@/shared/auth/browser'
import TurnstileWidget from '@/components/TurnstileWidget.vue'
import { isTurnstileEnabled, type TurnstileSurfaceAction } from '@/shared/turnstile'

type AuthMode = 'login' | 'register' | 'reset'
type InAppOauthProvider = 'wechat' | 'qq'
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

const qqLoginIconImage = '/icons/qq_loge.png'

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
const turnstileEnabled = isTurnstileEnabled()
const turnstileRef = ref<InstanceType<typeof TurnstileWidget> | null>(null)
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
      turnstileRef.value?.reset()
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

function changeMode(mode: AuthMode) {
  emit('change-mode', mode)
}

function requiresAgreement(): boolean {
  return props.authMode === 'login' || props.authMode === 'register'
}

function canSubmitAuth(): boolean {
  return !props.authLoading && (!requiresAgreement() || props.acceptTerms)
}

function submitOnEnter() {
  if (props.authMode === 'login' && canSubmitAuth()) {
    emit('submit')
  }
}

function emitInAppOauth() {
  if (inAppOauthProvider.value === 'wechat') {
    emit('loginWithWechat')
    return
  }
  if (inAppOauthProvider.value === 'qq') {
    emit('loginWithQq')
  }
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
      <div class="auth-modal-head">
        <div class="auth-modal-head__row">
          <h3>{{ displayTitle }}</h3>
          <button
            v-if="preferInAppOauth"
            class="auth-inapp-panel-switch"
            type="button"
            :aria-label="`切换到${inAppPanelSwitchLabel}`"
            @click="toggleInAppLoginPanel"
          >
            {{ inAppPanelSwitchLabel }}
          </button>
        </div>

        <!-- 端内一键登录态不用三段式 Tab；注册/重置走账号面板里的轻链 -->
        <div
          v-if="!preferInAppOauth"
          class="auth-mode-switch"
          role="tablist"
          aria-label="认证模式切换"
        >
          <button class="auth-mode-btn" :class="{ active: authMode === 'login' }" type="button"
            :aria-pressed="authMode === 'login'" :disabled="authMode === 'login'" @click="changeMode('login')">
            登录
          </button>
          <button class="auth-mode-btn" :class="{ active: authMode === 'register' }" type="button"
            :aria-pressed="authMode === 'register'" :disabled="authMode === 'register'" @click="changeMode('register')">
            注册
          </button>
          <button class="auth-mode-btn" :class="{ active: authMode === 'reset' }" type="button"
            :aria-pressed="authMode === 'reset'" :disabled="authMode === 'reset'" @click="changeMode('reset')">
            重置密码
          </button>
        </div>
      </div>

      <!-- 端内：默认只展示一键登录；账号密码由标题旁按钮切入 -->
      <div v-if="showInAppOauthPanel" class="auth-inapp-login" aria-label="端内一键登录">
        <button
          class="auth-btn auth-login-method auth-inapp-login__btn"
          :class="inAppOauthProvider === 'wechat' ? 'auth-inapp-login__btn--wechat' : 'auth-qq-login'"
          type="button"
          :disabled="(inAppOauthProvider === 'wechat' ? wechatLoginLoading : qqLoginLoading) || !acceptTerms"
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
            <input class="checkbox-input" type="checkbox" :checked="acceptTerms" @change="updateAcceptTerms" />
            <span class="auth-agreement-row__text">
              同意
              <router-link to="/terms">用户协议</router-link>、
              <router-link to="/privacy">隐私政策</router-link>
              与
              <router-link to="/payment-refund">支付说明</router-link>
            </span>
          </label>
        </div>
      </div>

      <div v-if="showAccountPanel" class="auth-modal-body">
        <template v-if="authMode !== 'reset'">
          <label>
            {{ authMode === 'login' ? '用户名或邮箱' : '用户名' }}
            <input :value="authUsername" type="text" autocomplete="username"
              :placeholder="authMode === 'login' ? '请输入用户名或邮箱' : '请输入用户名'" @input="updateUsername"
              @keydown.enter.prevent="submitOnEnter" />
          </label>
          <template v-if="authMode === 'register'">
            <label>
              邮箱
              <input :value="authEmail" type="email" autocomplete="email" placeholder="请输入注册邮箱" @input="updateEmail" />
            </label>
            <label>
              邀请码
              <input :value="authInviteCode" type="text" maxlength="32" autocomplete="off" placeholder="可选"
                @input="updateInviteCode" />
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
          <label v-if="loginRequiresTwoFactor">
            邮箱验证码
            <div class="inline-inputs auth-code-row">
              <input :value="authEmailCode" type="text" maxlength="6" placeholder="输入 6 位验证码" @input="updateEmailCode"
                @keydown.enter.prevent="submitOnEnter" />
              <button class="auth-btn ghost" type="button" :disabled="sendCodeLoading || sendCodeCountdown > 0"
                @click="emit('sendAuthCode')">
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
              <input :value="authEmailCode" type="text" maxlength="6" placeholder="输入 6 位验证码"
                @input="updateEmailCode" />
              <button class="auth-btn ghost" type="button" :disabled="sendCodeLoading || sendCodeCountdown > 0"
                @click="emit('sendAuthCode')">
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
            <input :value="authPassword" type="password" autocomplete="new-password" placeholder="至少 6 位新密码"
              @input="updatePassword" />
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
        <template v-if="(authMode === 'register' || authMode === 'login') && showAccountPanel && !showInAppOauthPanel">
          <div
            class="auth-agreement-row"
            :class="{ 'auth-agreement-row--compact': preferInAppOauth }"
          >
            <label class="checkbox-label">
              <input class="checkbox-input" type="checkbox" :checked="acceptTerms" @change="updateAcceptTerms" />
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
        </template>
      </div>

      <div
        v-if="showOtherLoginMethods"
        class="auth-login-methods" aria-label="第三方登录方式">
        <div class="auth-login-divider">
          <span>其他方式登录</span>
        </div>
        <button v-if="showGithubLogin" class="auth-btn ghost auth-login-method"
          type="button"
          :disabled="githubLoginLoading || !acceptTerms" @click="emit('loginWithGithub')">
          <img class="auth-login-method__icon" src="/icons/github.svg" alt="" aria-hidden="true" />
          <span>{{ githubLoginLoading ? '跳转中...' : 'GitHub 快捷登录' }}</span>
        </button>
        <button v-if="showWechatLogin" class="auth-btn ghost auth-login-method"
          type="button"
          :disabled="wechatLoginLoading || !acceptTerms" @click="emit('loginWithWechat')">
          <img class="auth-login-method__icon" src="/icons/wechat.svg" alt="" aria-hidden="true" />
          <span>{{ wechatLoginLoading ? '跳转中...' : '微信快捷登录' }}</span>
        </button>
        <button v-if="showQqLogin"
          class="auth-btn ghost auth-login-method auth-qq-login" type="button" :aria-busy="qqLoginLoading"
          aria-label="使用QQ登录" :disabled="qqLoginLoading || !acceptTerms" @click="emit('loginWithQq')">
          <img class="auth-login-method__icon" :src="qqLoginIconImage" alt="" aria-hidden="true" />
          <span>{{ qqLoginLoading ? '跳转中...' : 'QQ快捷登录' }}</span>
        </button>
        <button v-if="showGiteeLogin"
          class="auth-btn ghost auth-login-method auth-gitee-login" type="button" :aria-busy="giteeLoginLoading"
          aria-label="使用Gitee登录" :disabled="giteeLoginLoading || !acceptTerms" @click="emit('loginWithGitee')">
          <img class="auth-login-method__icon" src="/icons/gitee.svg" alt="" aria-hidden="true" />
          <span>{{ giteeLoginLoading ? '跳转中...' : 'Gitee快捷登录' }}</span>
        </button>
      </div>

      <div class="auth-modal-actions" :class="{ 'auth-modal-actions--single': showInAppOauthPanel }">
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
