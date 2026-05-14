<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/auth'
import AppToast from '@/components/AppToast.vue'
import PortalTopNav from '@/components/PortalTopNav.vue'
import PortalMobileDock from '@/components/PortalMobileDock.vue'
import { useToast } from '@/composables/useToast'
import { AUTH_UNAUTHORIZED_EVENT, type AuthUnauthorizedEventDetail } from '@/shared/api/authEvents'
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const currentYear = new Date().getFullYear()
const { toastVisible, toastMessage, toastType, showToast, hideToast } = useToast()
const showSiteFooter = computed(() => !route.matched.some((record) => record.meta.hideSiteFooter === true))
const devAutoLoginCredentials = import.meta.env.DEV
  ? {
    username: import.meta.env.VITE_DEV_AUTO_LOGIN_USERNAME?.trim() ?? '',
    password: import.meta.env.VITE_DEV_AUTO_LOGIN_PASSWORD?.trim() ?? '',
  }
  : null
let handlingUnauthorized = false

async function loginWithDevelopmentAccount() {
  if (!devAutoLoginCredentials?.username || !devAutoLoginCredentials.password) {
    return
  }

  try {
    await auth.login(devAutoLoginCredentials.username, devAutoLoginCredentials.password)
  } catch (error) {
    console.warn('开发模式自动登录失败', error)
  }
}

async function initializeAuthSession() {
  auth.hydrate()

  if (auth.token) {
    try {
      await auth.initializeSession()
    } catch (error) {
      console.warn('初始化登录态失败', error)
    }
  }

  if (
    devAutoLoginCredentials?.username &&
    devAutoLoginCredentials.password &&
    (!auth.token || auth.username !== devAutoLoginCredentials.username)
  ) {
    auth.logout()
    await loginWithDevelopmentAccount()
  }
}

function currentRedirectTarget() {
  const fullPath = route.fullPath.trim()
  if (!fullPath || !fullPath.startsWith('/') || fullPath.startsWith('//') || fullPath === '/') {
    return ''
  }
  return fullPath
}

function handleUnauthorizedSession(event: Event) {
  if (route.path.startsWith('/dev')) {
    return
  }

  if (handlingUnauthorized) {
    return
  }

  const alreadyShowingLogin = route.name === 'home' && route.query.modal === 'auth'
  if (!auth.token.trim() && alreadyShowingLogin) {
    return
  }

  handlingUnauthorized = true
  const detail = (event as CustomEvent<AuthUnauthorizedEventDetail>).detail
  const redirectTarget = currentRedirectTarget()
  const nextQuery: Record<string, string> = { modal: 'auth', mode: 'login' }
  if (redirectTarget) {
    nextQuery.redirect_to = redirectTarget
  }

  auth.logout()
  showToast(detail?.message || '未登录或登录已过期，请重新登录', 'warning')

  void router.replace({ name: 'home', query: nextQuery }).finally(() => {
    window.setTimeout(() => {
      handlingUnauthorized = false
    }, 500)
  })
}

onMounted(() => {
  window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorizedSession)
  void initializeAuthSession()
})

onBeforeUnmount(() => {
  window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorizedSession)
})
</script>

<template>
  <div class="app-shell">
    <div class="app-content">
      <el-scrollbar class="app-scrollbar">
        <div class="app-view-container" :class="{ 'app-view-container--no-footer': !showSiteFooter }">
          <PortalTopNav :class="['app-top-nav', { 'app-top-nav--home': route.name === 'home' }]" />
          <RouterView v-slot="{ Component }">
            <Suspense>
              <component :is="Component" />
            </Suspense>
          </RouterView>

          <div v-if="showSiteFooter" class="site-footer-host">
            <footer class="site-footer" aria-label="网站基础信息">
              <div class="site-footer-grid">
                <div class="site-footer-block">
                  <h3>网站信息</h3>
                  <p>平台名称：柒叁信息（73info）</p>
                  <p>主体类型：企业服务平台</p>
                  <p>联系邮箱：fanbo@73info.cn</p>
                </div>
                <div class="site-footer-block">
                  <h3>备案与合规</h3>
                  <p>
                    ICP备案号：
                    <a href="https://beian.miit.gov.cn/" target="_blank"
                      rel="noopener noreferrer">滇ICP备2026006119号-2</a>
                  </p>
                  <p>
                    公安备案号：
                    <a class="public-security-beian-link"
                      href="https://beian.mps.gov.cn/#/query/webSearch?code=53062802000020" target="_blank"
                      rel="noopener noreferrer">
                      <img class="public-security-beian-icon" src="/icons/beian.png" alt="公安备案图标" />
                      <span>滇公网安备53062802000020号</span>
                    </a>
                  </p>
                  <p>增值电信业务许可：涉及相应许可的交易担保功能暂未开放</p>
                </div>
                <div class="site-footer-block">
                  <h3>服务说明</h3>
                  <p><router-link to="/terms">用户协议</router-link></p>
                  <p><router-link to="/privacy">隐私政策</router-link></p>
                  <p><router-link to="/payment-refund">支付与退款说明</router-link></p>
                </div>
              </div>
              <p class="site-footer-copy">© {{ currentYear }} 柒叁信息 73Info. All rights reserved.</p>
            </footer>
          </div>
        </div>
      </el-scrollbar>
      <PortalMobileDock />
    </div>
    <AppToast :visible="toastVisible" :message="toastMessage" :type="toastType" @close="hideToast" />
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  height: auto;
  overflow: visible;
}

.app-content {
  position: relative;
  z-index: 2;
  min-height: 100vh;
  background: #f6f8fb;
}

.app-scrollbar {
  height: 100vh;
}

.app-view-container {
  padding: 0 0 28px;
}

.app-view-container--no-footer {
  padding-bottom: 0;
}

.site-footer-host {
  width: min(1280px, calc(100% - 24px));
  margin: 0 auto;
}

@media (max-width: 900px) {

  .app-top-nav:not(.app-top-nav--home) {
    display: none;
  }

  .app-shell,
  .app-content {
    min-height: 100vh;
    height: auto;
  }

  .site-footer-host {
    width: calc(100% - 20px);
  }

  .app-view-container {
    padding-bottom: 108px;
  }
}
</style>

<style>
html {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
}

html::-webkit-scrollbar {
  width: 4px;
}

html::-webkit-scrollbar-button {
  display: none;
  width: 0;
  height: 0;
}

html::-webkit-scrollbar-track {
  background: transparent;
}

html::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.22);
  border-radius: 999px;
}

html::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.42);
}

@media (max-width: 780px) {
  html::-webkit-scrollbar {
    width: 0;
    height: 0;
  }
}

/* el-scrollbar 滑块样式 */
.app-scrollbar .el-scrollbar__bar.is-vertical .el-scrollbar__thumb {
  background: linear-gradient(180deg, rgba(56, 189, 248, 0.7), rgba(149, 213, 178, 0.8));
  border-radius: 999px;
}

.app-scrollbar .el-scrollbar__bar.is-vertical .el-scrollbar__thumb:hover {
  background: linear-gradient(180deg, rgba(125, 211, 252, 0.9), rgba(149, 213, 178, 1));
}

.app-scrollbar .el-scrollbar__bar.is-vertical {
  width: 8px;
  right: 0;
}

.app-dev-host .dev-shell {
  min-height: 0;
  height: 100%;
  border-radius: 24px;
  border: 1px solid rgba(228, 234, 246, 0.95);
  box-shadow: 0 16px 40px rgba(90, 120, 180, 0.08);
  overflow: hidden;
  background:
    radial-gradient(circle at top right, rgba(96, 165, 250, 0.08), transparent 24%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(247, 249, 253, 0.92));
}

.app-dev-host .dev-shell__aside,
.app-dev-host .dev-shell>.el-container:last-child {
  height: 100%;
}

.app-dev-host .dev-shell__aside {
  background:
    radial-gradient(circle at top left, rgba(96, 165, 250, 0.18), transparent 26%),
    linear-gradient(180deg, rgba(18, 28, 45, 0.96), rgba(24, 36, 58, 0.96));
  border-right: 1px solid rgba(191, 219, 254, 0.14);
  box-shadow: inset -1px 0 0 rgba(255, 255, 255, 0.05);
}

.app-dev-host .dev-shell__brand {
  padding: 8px 8px 0;
}

.app-dev-host .dev-shell__brand-subtitle {
  color: rgba(203, 213, 225, 0.6);
}

.app-dev-host .dev-shell__menu .el-menu-item,
.app-dev-host .dev-shell__menu .el-sub-menu__title {
  margin-bottom: 6px;
  border-radius: 14px;
}

.app-dev-host .dev-shell__menu .el-menu-item.is-active {
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.3), rgba(59, 130, 246, 0.18));
  border-color: rgba(147, 197, 253, 0.2);
  box-shadow: 0 10px 24px rgba(37, 99, 235, 0.18);
}

.app-dev-host .dev-shell__menu .el-menu-item:hover,
.app-dev-host .dev-shell__menu .el-sub-menu__title:hover {
  background: rgba(96, 165, 250, 0.12);
}

.app-dev-host .dev-shell__header {
  padding: 24px 28px 14px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.4), rgba(255, 255, 255, 0));
}

.app-dev-host .dev-shell__title {
  color: #0f172a;
}

.app-dev-host .dev-shell__main {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.04));
}

.app-dev-host .dev-route-view--shell {
  padding: 14px 28px 24px;
}

@media (max-width: 780px) {
  .app-dev-layout {
    gap: 8px;
    height: 100%;
    min-height: 0;
    padding-bottom: 6px;
    overflow: hidden;
  }

  .app-dev-host {
    flex: 1 1 0;
    width: calc(100% - 16px);
    min-height: 0;
    overflow: hidden;
  }

  .app-dev-host .dev-shell {
    min-height: 0;
    height: 100%;
    border-radius: 20px;
  }

  .app-dev-host .dev-shell__header {
    padding: 0;
    background: transparent;
  }

  .app-dev-host .dev-route-view--shell {
    padding: 16px 14px 24px;
  }

  .app-dev-host .dev-shell__aside,
  .app-dev-host .dev-shell>.el-container:last-child {
    height: 100%;
  }
}
</style>
