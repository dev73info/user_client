<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  DataAnalysis,
  Wallet,
  Box,
  MagicStick,
  List,
  Connection,
} from '@element-plus/icons-vue'

import { useAuthStore } from '@dev/stores/auth'
import { useBreakpoint } from '@dev/composables/useBreakpoint'
import { DEV_PORTAL_URL, buildUnifiedAuthUrl } from '@/config/runtime'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { isMobile } = useBreakpoint()

auth.hydrate()

const mobileMenuOpen = ref(false)

function handleShiftWheel(e: WheelEvent) {
  if (!e.shiftKey) return
  let el = e.target as HTMLElement | null
  while (el) {
    if (el.classList?.contains('el-scrollbar__wrap') && el.scrollWidth > el.clientWidth) {
      el.scrollLeft += e.deltaY
      e.stopPropagation()
      return
    }
    el = el.parentElement
  }
}

onMounted(() => {
  void auth.initializeSession().catch(() => {
    const redirectTarget = route.path === '/dev/login' ? DEV_PORTAL_URL : route.fullPath
    void router.replace(buildUnifiedAuthUrl('login', redirectTarget))
  })
  document.addEventListener('wheel', handleShiftWheel, true)
})

onUnmounted(() => {
  document.removeEventListener('wheel', handleShiftWheel, true)
})

const showShell = computed(() => route.path !== '/dev/login')
const pageTitle = computed(() => String(route.meta.title ?? '开发者端'))

watchEffect(() => {
  document.title = `${pageTitle.value} - 73Info Dev`
})

// Auto-close drawer on route change so the page contents are visible after tap.
watch(
  () => route.path,
  () => {
    mobileMenuOpen.value = false
  },
)

// Close drawer automatically if viewport grows back to desktop.
watch(isMobile, (value) => {
  if (!value) mobileMenuOpen.value = false
})

function logout() {
  auth.logout()
  void router.replace(buildUnifiedAuthUrl('login', DEV_PORTAL_URL))
}

function openMobileMenu() {
  mobileMenuOpen.value = true
}
</script>

<template>
  <router-view v-if="!showShell" />

  <el-container v-else class="dev-shell" :class="{ 'dev-shell--mobile': isMobile }">
    <el-aside v-if="!isMobile" width="232px" class="dev-shell__aside">
      <el-scrollbar class="dev-shell__aside-scrollbar">
        <div class="dev-shell__brand">
          <img src="/icons/home-icon.svg" alt="73Info" class="dev-shell__logo" />
          <div>
            <div class="dev-shell__brand-title">73Info Dev</div>
            <div class="dev-shell__brand-subtitle">Engineering Control Surface</div>
          </div>
        </div>

        <el-menu :default-active="route.path" :default-openeds="['resources', 'requirements']" router
          class="dev-shell__menu">
          <el-menu-item index="/dev/overview">
            <el-icon>
              <DataAnalysis />
            </el-icon>
            <span>开发概览</span>
          </el-menu-item>
          <!-- 钱包：暂时禁用 -->
          <el-menu-item index="/dev/wallet/disabled" disabled class="dev-shell__menu-item--disabled">
            <el-icon>
              <Wallet />
            </el-icon>
            <span>钱包<em class="dev-shell__menu-tag">暂未开放</em></span>
          </el-menu-item>
          <el-sub-menu index="resources">
            <template #title>
              <el-icon>
                <Box />
              </el-icon>
              <span>资源管理</span>
            </template>
            <el-menu-item index="/dev/resources/plugins-init">
              <el-icon>
                <MagicStick />
              </el-icon>资源初始化
            </el-menu-item>
            <el-menu-item index="/dev/resources/list">
              <el-icon>
                <List />
              </el-icon>资源列表
            </el-menu-item>
          </el-sub-menu>
          <el-sub-menu index="requirements">
            <template #title>
              <el-icon>
                <Connection />
              </el-icon>
              <span>需求协作</span>
            </template>
            <el-menu-item index="/dev/requirements/hall">需求大厅</el-menu-item>
            <el-menu-item index="/dev/requirements/my">我的需求单</el-menu-item>
          </el-sub-menu>
        </el-menu>

      </el-scrollbar>
    </el-aside>

    <el-container>
      <el-header class="dev-shell__header" :class="{ 'dev-shell__header--mobile': isMobile }">
        <template v-if="isMobile">
          <div class="dev-shell__mobile-bar">
            <button type="button" class="dev-shell__menu-btn" aria-label="打开菜单" @click="openMobileMenu">
              <span></span>
              <span></span>
              <span></span>
            </button>
            <div class="dev-shell__mobile-title-wrap">
              <div class="dev-shell__mobile-brand">73Info Dev</div>
              <h1 class="dev-shell__title dev-shell__title--mobile">{{ pageTitle }}</h1>
            </div>
            <el-button type="primary" size="small" plain class="dev-shell__mobile-logout" @click="logout">
              退出
            </el-button>
          </div>
        </template>
        <template v-else>
          <div class="dev-shell__header-copy">
            <h1 class="dev-shell__title">{{ pageTitle }}</h1>
          </div>
        </template>
      </el-header>

      <el-main class="dev-shell__main">
        <el-scrollbar class="dev-shell__main-scrollbar">
          <div class="dev-route-view dev-route-view--shell" :class="{ 'dev-route-view--mobile': isMobile }">
            <router-view />
          </div>
        </el-scrollbar>
      </el-main>
    </el-container>

    <el-drawer v-if="isMobile" v-model="mobileMenuOpen" direction="ltr" size="82%" :with-header="false"
      class="dev-shell__drawer">
      <div class="dev-shell__drawer-inner">
        <div class="dev-shell__brand">
          <img src="/icons/home-icon.svg" alt="73Info" class="dev-shell__logo" />
          <div>
            <div class="dev-shell__brand-title">73Info Dev</div>
            <div class="dev-shell__brand-subtitle">Engineering Control Surface</div>
          </div>
        </div>

        <el-menu :default-active="route.path" :default-openeds="['resources', 'requirements']" router
          class="dev-shell__menu">
          <el-menu-item index="/dev/overview">
            <el-icon>
              <DataAnalysis />
            </el-icon>
            <span>开发概览</span>
          </el-menu-item>
          <!-- 钱包：暂时禁用 -->
          <el-menu-item index="/dev/wallet/disabled" disabled class="dev-shell__menu-item--disabled">
            <el-icon>
              <Wallet />
            </el-icon>
            <span>钱包<em class="dev-shell__menu-tag">暂未开放</em></span>
          </el-menu-item>
          <el-sub-menu index="resources">
            <template #title>
              <el-icon>
                <Box />
              </el-icon>
              <span>资源管理</span>
            </template>
            <el-menu-item index="/dev/resources/plugins-init">
              <el-icon>
                <MagicStick />
              </el-icon>资源初始化
            </el-menu-item>
            <el-menu-item index="/dev/resources/list">
              <el-icon>
                <List />
              </el-icon>资源列表
            </el-menu-item>
          </el-sub-menu>
          <el-sub-menu index="requirements">
            <template #title>
              <el-icon>
                <Connection />
              </el-icon>
              <span>需求协作</span>
            </template>
            <el-menu-item index="/dev/requirements/hall">需求大厅</el-menu-item>
            <el-menu-item index="/dev/requirements/my">我的需求单</el-menu-item>
          </el-sub-menu>
        </el-menu>

      </div>
    </el-drawer>
  </el-container>
</template>
