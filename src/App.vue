<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import AppDownloadCard from '@/components/app/AppDownloadCard.vue'
import AppSiteFooter from '@/components/app/AppSiteFooter.vue'
import PortalTopNav from '@/components/PortalTopNav.vue'
import PortalMobileDock from '@/components/PortalMobileDock.vue'
import SupportChatWidget from '@/components/SupportChatWidget.vue'
import MockIdentitySwitcher from '@/mock/MockIdentitySwitcher.vue'
import { TScrollbar } from 'ui_73info'
import { useAppShellAuth } from '@/components/app/useAppShellAuth'

/**
 * 门户外壳：滚动容器 + 顶栏 + 路由出口 + 页脚 + 浮层。
 *
 * 拆分（R047）：登录态接线（初始化会话、开发模式自动登录、全局 401 兜底）在
 * `components/app/useAppShellAuth.ts`，页脚与下载进度浮层各是一个组件，
 * 外壳样式在 `app-shell.css`（scoped）与 `app-shell-global.css`（非 scoped）。
 */
const route = useRoute()
// 登录态接线靠这次调用挂载（启动初始化会话 + 全局 401 兜底），外壳本身不再读取它的返回值。
useAppShellAuth()
const showSiteFooter = computed(
  () => !route.matched.some((record) => record.meta.hideSiteFooter === true),
)
const immersiveWorkbench = computed(() =>
  route.matched.some((record) => record.meta.workbenchShell === true),
)
</script>

<template>
  <div class="app-shell" :class="{ 'app-shell--immersive': immersiveWorkbench }">
    <div class="app-content" :class="{ 'app-content--immersive': immersiveWorkbench }">
      <TScrollbar
        class="app-scrollbar app-shell-scrollbar"
        :class="{ 'app-shell-scrollbar--immersive': immersiveWorkbench }"
      >
        <div
          class="app-view-container"
          :class="{
            'app-view-container--no-footer': !showSiteFooter,
            'app-view-container--immersive': immersiveWorkbench,
          }"
        >
          <PortalTopNav
            :class="[
              'app-top-nav',
              {
                'app-top-nav--home': route.name === 'home',
                'app-top-nav--workbench': immersiveWorkbench,
              },
            ]"
          />
          <RouterView v-slot="{ Component }">
            <Suspense>
              <component :is="Component" />
            </Suspense>
          </RouterView>

          <AppSiteFooter v-if="showSiteFooter" />
        </div>
      </TScrollbar>
      <PortalMobileDock v-if="!immersiveWorkbench" />
    </div>

    <!-- mock 身份切换器：只在 pnpm dev 且开了 mock 时渲染，详见 src/mock/ -->
    <MockIdentitySwitcher />

    <!-- 全局资源下载进度浮层：切换路由不中断下载，浮层持续展示进度 -->
    <AppDownloadCard />
    <SupportChatWidget v-if="!immersiveWorkbench" />
  </div>
</template>

<style scoped src="./components/app/app-shell.css"></style>
<style src="./components/app/app-shell-global.css"></style>
