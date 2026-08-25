<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/auth'
import { useDownloadStore } from '@/stores/download'
import AppToast from '@/components/AppToast.vue'
import PortalTopNav from '@/components/PortalTopNav.vue'
import PortalMobileDock from '@/components/PortalMobileDock.vue'
import { useToast } from '@/composables/useToast'
import { AUTH_UNAUTHORIZED_EVENT, type AuthUnauthorizedEventDetail } from '@/shared/api/authEvents'
const auth = useAuthStore()
const downloadStore = useDownloadStore()
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
                  <p>平台状态：内测中</p>
                  <p>联系邮箱：fanbo@73info.cn</p>
                  <p>投诉与侵权处理：fanbo@73info.cn</p>
                </div>
                <div class="site-footer-block">
                  <h3>备案与合规</h3>
                  <p>
                    ICP备案号：
                    <a href="https://beian.miit.gov.cn/" target="_blank"
                      rel="noopener noreferrer">滇ICP备2026006119号-3</a>
                  </p>
                  <p>
                    公安备案号：
                    <a class="public-security-beian-link"
                      href="https://beian.mps.gov.cn/#/query/webSearch?code=53062802000020" target="_blank"
                      rel="noopener noreferrer">
                      <img class="public-security-beian-icon" src="/icons/beian.png" alt="公安备案图标" />
                      <span>滇公网安备53062802000020号（重新备案中）</span>
                    </a>
                  </p>
                  <p>交易功能说明：使用第三方分账系统进行交易担保于分账，资金安全有保障</p>
                </div>
                <div class="site-footer-block">
                  <h3>服务说明</h3>
                  <p><router-link to="/about">关于我们</router-link></p>
                  <p><router-link to="/terms">用户协议</router-link></p>
                  <p><router-link to="/privacy">隐私政策</router-link></p>
                  <p><router-link to="/payment-refund">支付与退款说明</router-link></p>
                  <p><router-link to="/tickets">工单中心</router-link></p>
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

    <!-- 全局资源下载进度浮层：切换路由不中断下载，浮层持续展示进度 -->
    <Transition name="download-pop">
      <div v-if="downloadStore.state.active" class="global-download-card" role="status"
        aria-live="polite">
        <div class="global-download-card__body">
          <div class="global-download-card__row">
            <span class="global-download-card__file">{{ downloadStore.state.fileName }}</span>
            <span class="global-download-card__pct">{{ downloadStore.state.percent }}%</span>
          </div>
          <div class="global-download-card__track">
            <div class="global-download-card__bar"
              :style="{ width: `${downloadStore.state.percent}%` }"></div>
          </div>
          <div class="global-download-card__meta">
            <span v-if="downloadStore.loadedBytes > 0">
              {{ downloadStore.formatBytes(downloadStore.loadedBytes) }}
              <template v-if="downloadStore.totalBytes > 0">
                / {{ downloadStore.formatBytes(downloadStore.totalBytes) }}
              </template>
            </span>
            <span v-else>正在下载…</span>
          </div>
        </div>
      </div>
    </Transition>
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
    display: none;
    width: calc(100% - 20px);
  }

  .app-view-container {
    padding-bottom: 108px;
  }
}

/* ── 全局资源下载进度浮层 ── */
.global-download-card {
  position: fixed;
  right: 18px;
  bottom: 84px;
  z-index: 3000;
  width: min(340px, calc(100vw - 36px));
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.94);
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.28);
  backdrop-filter: blur(6px);
  border: 1px solid rgba(148, 163, 184, 0.22);
  color: #e2e8f0;
}

.global-download-card__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.global-download-card__file {
  font-size: 13px;
  font-weight: 600;
  color: #f1f5f9;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.global-download-card__pct {
  flex: 0 0 auto;
  font-size: 13px;
  font-weight: 800;
  color: #93c5fd;
  font-variant-numeric: tabular-nums;
}

.global-download-card__track {
  position: relative;
  height: 7px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.28);
  overflow: hidden;
}

.global-download-card__bar {
  position: absolute;
  inset: 0 auto 0 0;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #3b82f6, #60a5fa);
  transition: width 120ms linear;
}

.global-download-card__meta {
  margin-top: 6px;
  font-size: 12px;
  color: #94a3b8;
  font-variant-numeric: tabular-nums;
}

.download-pop-enter-active,
.download-pop-leave-active {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.download-pop-enter-from,
.download-pop-leave-to {
  opacity: 0;
  transform: translateY(8px);
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
  width: 4px;
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
