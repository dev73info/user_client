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
    <DevApp v-if="isDevRoute" />

    <template v-else>
      <div class="app-content">
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
      </div>
    </template>
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
</style>
