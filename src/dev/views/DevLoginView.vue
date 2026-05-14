<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { getGithubAuthorizeUrl } from '@dev/api/auth'
import { useToast } from '@dev/composables/useToast'
import { useAuthStore } from '@dev/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const userPortalUrl =
  (import.meta.env.VITE_USER_PORTAL_URL as string | undefined)?.trim() || 'https://73info.cn/'

type AuthMode = 'login' | 'register' | 'reset'

const authMode = ref<AuthMode>('login')
const authUsername = ref('')
const authPassword = ref('')
const authEmail = ref('')
const authEmailCode = ref('')
const loginRequiresTwoFactor = ref(false)
const acceptDevAgreement = ref(false)
const githubLoading = ref(false)
const sendCodeLoading = ref(false)
const sendCodeCountdown = ref(0)
let sendCodeTimer: ReturnType<typeof setInterval> | null = null

const { showToast } = useToast()

function clearSendCodeTimer() {
  if (sendCodeTimer) {
    clearInterval(sendCodeTimer)
    sendCodeTimer = null
  }
}

function resetTransientState() {
  authPassword.value = ''
  authEmailCode.value = ''
  loginRequiresTwoFactor.value = false
  sendCodeLoading.value = false
  sendCodeCountdown.value = 0
  clearSendCodeTimer()
}

function switchMode(mode: string | number | boolean) {
  if (mode === 'login' || mode === 'register' || mode === 'reset') {
    authMode.value = mode
  }
  resetTransientState()
}

onMounted(() => {
  auth.hydrate()

  if (auth.isAuthed) {
    void auth
      .ensureDevAccess()
      .then((hasAccess) => {
        void router.replace(hasAccess ? '/dev/overview' : '/dev/no-access')
      })
      .catch(() => {
        auth.logout()
      })
    return
  }

  const oauthToken =
    typeof route.query.oauth_token === 'string' ? route.query.oauth_token.trim() : ''
  const oauthError =
    typeof route.query.oauth_error === 'string' ? route.query.oauth_error.trim() : ''
  const accessError =
    typeof route.query.access_error === 'string' ? route.query.access_error.trim() : ''

  if (oauthToken) {
    auth.setToken(oauthToken)
    showToast('授权登录成功', 'success')
    void router.replace('/dev/overview')
    return
  }

  if (oauthError) {
    showToast(`授权登录失败: ${oauthError}`, 'error')
    void router.replace({ path: '/dev/login', query: {} })
    return
  }

  if (accessError) {
    showToast(accessError, 'warning')
    void router.replace({ path: '/dev/login', query: {} })
  }
})

onBeforeUnmount(() => {
  clearSendCodeTimer()
})

async function loginWithGithub() {
  if (githubLoading.value || auth.loading) {
    return
  }
  if (!acceptDevAgreement.value) {
    showToast('请先勾选并同意《开发者入驻协议》', 'warning')
    return
  }

  githubLoading.value = true
  const redirectTarget = `${window.location.origin}${router.resolve('/dev/overview').href}`

  try {
    const payload = await getGithubAuthorizeUrl(redirectTarget)
    if (!payload.url) {
      throw new Error('GitHub 授权地址为空')
    }
    window.location.href = payload.url
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'GitHub 登录失败', 'error')
    githubLoading.value = false
  }
}

async function sendEmailCode() {
  if (sendCodeLoading.value || sendCodeCountdown.value > 0) {
    return
  }

  sendCodeLoading.value = true
  try {
    if (authMode.value === 'login' && loginRequiresTwoFactor.value) {
      const username = authUsername.value.trim()
      if (!username || !authPassword.value) {
        showToast('请先输入用户名和密码', 'warning')
        return
      }
      const result = await auth.login(username, authPassword.value)
      if (!result.requiresTwoFactor) {
        showToast('登录成功', 'success')
        await router.replace('/dev/overview')
        return
      }
    } else {
      const email = authEmail.value.trim()
      if (!email) {
        showToast('请输入邮箱地址', 'warning')
        return
      }
      if (authMode.value === 'register') {
        await auth.sendRegisterEmailCode(email)
      } else {
        await auth.sendResetPasswordEmailCode(email)
      }
    }
    showToast('验证码已发送，请查收邮箱', 'success')

    sendCodeCountdown.value = 60
    clearSendCodeTimer()
    sendCodeTimer = setInterval(() => {
      if (sendCodeCountdown.value <= 1) {
        sendCodeCountdown.value = 0
        clearSendCodeTimer()
        return
      }
      sendCodeCountdown.value -= 1
    }, 1000)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '发送验证码失败', 'error')
  } finally {
    sendCodeLoading.value = false
  }
}

async function submitAuth() {
  if (auth.loading) {
    return
  }

  try {
    if (authMode.value === 'login') {
      if (!acceptDevAgreement.value) {
        showToast('请先勾选并同意《开发者入驻协议》', 'warning')
        return
      }
      const twoFactorCode = authEmailCode.value.trim()
      if (loginRequiresTwoFactor.value && twoFactorCode.length !== 6) {
        showToast('请输入 6 位邮箱验证码', 'warning')
        return
      }
      const result = await auth.login(
        authUsername.value.trim(),
        authPassword.value,
        loginRequiresTwoFactor.value ? twoFactorCode : undefined,
      )
      if (result.requiresTwoFactor) {
        loginRequiresTwoFactor.value = true
        authEmailCode.value = ''
        showToast('验证码已发送，请查收邮箱', 'success')
        return
      }
      loginRequiresTwoFactor.value = false
      showToast('登录成功', 'success')
      await router.replace('/dev/overview')
      return
    }

    if (authMode.value === 'register') {
      if (!acceptDevAgreement.value) {
        showToast('请先勾选并同意《开发者入驻协议》', 'warning')
        return
      }
      if (!authEmail.value.trim()) {
        showToast('邮箱不能为空', 'warning')
        return
      }
      if (authEmailCode.value.trim().length !== 6) {
        showToast('请输入 6 位邮箱验证码', 'warning')
        return
      }
      await auth.registerWithEmail(
        authUsername.value.trim(),
        authPassword.value,
        authEmail.value.trim(),
        authEmailCode.value.trim(),
      )
      showToast('注册成功', 'success')
      await router.replace('/dev/overview')
      return
    }

    if (!acceptDevAgreement.value) {
      showToast('请先勾选并同意《开发者入驻协议》', 'warning')
      return
    }
    if (!authEmail.value.trim()) {
      showToast('邮箱不能为空', 'warning')
      return
    }
    if (authEmailCode.value.trim().length !== 6) {
      showToast('请输入 6 位邮箱验证码', 'warning')
      return
    }
    await auth.resetPasswordWithEmail(
      authEmail.value.trim(),
      authPassword.value,
      authEmailCode.value.trim(),
    )
    showToast('密码重置成功，已自动登录', 'success')
    await router.replace('/dev/overview')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '操作失败', 'error')
  }
}
</script>

<template>
  <main class="dev-login">
    <div class="dev-login__panel">
      <section class="dev-login__intro">
        <span class="dev-login__eyebrow">Developer Portal</span>
        <h1 class="dev-login__title">开发者工作台：接单、协作与交付的一站式入口</h1>
        <p class="dev-login__desc">
          登录 73Info
          Dev，集中处理需求大厅、接单协作、资源版本、交付回执与收益结算。支持账号密码、GitHub
          快捷登录和邮箱验证码。
        </p>

        <div class="dev-login__feature-list">
          <div class="dev-login__feature-item">
            <div class="dev-login__feature-title">统一账号登录</div>
            <div class="dev-login__feature-text">
              同一账号可在用户端与开发者端无缝切换，降低使用成本。
            </div>
          </div>
          <div class="dev-login__feature-item">
            <div class="dev-login__feature-title">常用认证方式</div>
            <div class="dev-login__feature-text">
              提供密码登录、GitHub 登录、邮箱验证码注册与重置，流程清晰直观。
            </div>
          </div>
        </div>
      </section>

      <el-card class="dev-login__card">
        <div class="dev-login__brand">
          <img src="/icons/home-icon.svg" alt="73Info" class="dev-login__brand-logo" />
          <div>
            <p class="dev-login__brand-name">73Info Dev</p>
            <p class="dev-login__brand-note">Engineering Control Surface</p>
          </div>
        </div>
        <a class="dev-login__portal-link" :href="userPortalUrl"> 前往 73Info 用户端 </a>

        <div class="dev-login__actions">
          <el-radio-group class="dev-login__mode" :model-value="authMode" @change="switchMode">
            <el-radio-button label="login">登录</el-radio-button>
            <el-radio-button label="register">注册</el-radio-button>
            <el-radio-button label="reset">重置密码</el-radio-button>
          </el-radio-group>

          <el-input
            v-if="authMode !== 'reset'"
            v-model="authUsername"
            placeholder="用户名"
            autocomplete="username"
          />

          <el-input
            v-if="authMode !== 'login'"
            v-model="authEmail"
            placeholder="邮箱"
            autocomplete="email"
          />

          <div v-if="authMode !== 'login' || loginRequiresTwoFactor" class="dev-login__code-row">
            <el-input v-model="authEmailCode" placeholder="6位邮箱验证码" maxlength="6" />
            <el-button
              :loading="sendCodeLoading"
              :disabled="sendCodeCountdown > 0"
              @click="sendEmailCode"
            >
              {{
                sendCodeCountdown > 0
                  ? `${sendCodeCountdown}s`
                  : loginRequiresTwoFactor
                    ? '重新发送'
                    : '发送验证码'
              }}
            </el-button>
          </div>

          <el-input
            v-model="authPassword"
            type="password"
            :placeholder="
              authMode === 'login'
                ? '密码'
                : authMode === 'register'
                  ? '设置密码（至少6位）'
                  : '新密码（至少6位）'
            "
            autocomplete="current-password"
            show-password
            @keyup.enter="submitAuth"
          />

          <div v-if="authMode === 'login' || authMode === 'register' || authMode === 'reset'">
            <el-checkbox v-model="acceptDevAgreement">
              我已阅读并同意
              <router-link to="/dev/developer-agreement">《开发者入驻协议》</router-link>
            </el-checkbox>
          </div>

          <el-button
            class="dev-login__submit"
            type="primary"
            size="large"
            :loading="auth.loading"
            :disabled="
              (authMode === 'register' || authMode === 'login' || authMode === 'reset') &&
              !acceptDevAgreement
            "
            @click="submitAuth"
          >
            {{
              authMode === 'login'
                ? loginRequiresTwoFactor
                  ? '验证并登录'
                  : '登录'
                : authMode === 'register'
                  ? '注册并登录'
                  : '重置密码并登录'
            }}
          </el-button>

          <el-button
            v-if="authMode === 'login'"
            class="dev-login__submit"
            plain
            size="large"
            :loading="githubLoading"
            :disabled="!acceptDevAgreement"
            @click="loginWithGithub"
          >
            {{ githubLoading ? '跳转中...' : 'GitHub 快捷登录' }}
          </el-button>
          <p class="dev-login__hint">
            使用开发者服务即表示您已阅读并同意
            <router-link to="/dev/developer-agreement">《开发者入驻协议》</router-link>
          </p>
          <p class="dev-login__hint">
            登录后会校验开发者权限。若当前账号未开通开发者身份，将自动进入权限提示页。
          </p>
        </div>
      </el-card>
    </div>

    <footer class="dev-compliance-footer dev-login__compliance-footer" aria-label="网站备案信息">
      <p>
        ICP备案号：
        <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer"
          >滇ICP备2026006119号-2</a
        >
      </p>
      <p>
        公安备案号：
        <a
          class="dev-public-security-beian-link"
          href="https://beian.mps.gov.cn/#/query/webSearch?code=53062802000020"
          target="_blank"
          rel="noopener noreferrer"
        >
          <img class="dev-public-security-beian-icon" src="/icons/beian.png" alt="公安备案图标" />
          <span>滇公网安备53062802000020号</span>
        </a>
      </p>
    </footer>
  </main>
</template>
