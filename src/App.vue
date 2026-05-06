<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'

import { useAuthStore } from '@/stores/auth'
import PortalTopNav from '@/components/PortalTopNav.vue'
import DevApp from '@dev/DevApp.vue'
const auth = useAuthStore()
const route = useRoute()
const currentYear = new Date().getFullYear()
const isDevRoute = computed(() => route.path.startsWith('/dev'))

onMounted(() => {
  auth.hydrate()
  void auth.initializeSession().catch(() => {
    auth.logout()
  })
})
</script>

<template>
  <div class="app-shell">
    <div class="app-content" :class="{ 'app-content--dev': isDevRoute }">
      <template v-if="isDevRoute">
        <div class="app-dev-layout">
          <PortalTopNav />
          <div class="app-dev-host">
            <DevApp />
          </div>
        </div>
      </template>

      <template v-else>
        <el-scrollbar class="app-scrollbar">
          <div class="app-view-container">
            <PortalTopNav />
            <RouterView v-slot="{ Component }">
              <Suspense>
                <component :is="Component" />
              </Suspense>
            </RouterView>

            <div class="site-footer-host">
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
                    <p>增值电信业务许可：按业务开展后补充</p>
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
      </template>
    </div>
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
  background: #f2ede3;
}

.app-content--dev {
  display: flex;
  flex-direction: column;
  height: 100vh;
  min-height: 0;
  overflow: hidden;
}

.app-dev-layout {
  display: flex;
  flex-direction: column;
  gap: 14px;
  height: 100%;
  min-height: 0;
  padding-bottom: 12px;
  overflow: hidden;
}

.app-dev-host {
  flex: 1 1 auto;
  width: min(1280px, calc(100% - 24px));
  margin: 0 auto;
  height: auto;
  min-height: 0;
}

.app-scrollbar {
  height: 100vh;
}

.app-view-container {
  padding: 0 0 28px;
}

.site-footer-host {
  width: min(1280px, calc(100% - 24px));
  margin: 0 auto;
}

@media (max-width: 780px) {

  .app-shell,
  .app-content {
    min-height: 100vh;
    height: auto;
  }

  .app-content--dev {
    height: 100vh;
    height: 100dvh;
    min-height: 0;
    overflow: hidden;
  }

  .site-footer-host {
    width: calc(100% - 20px);
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
