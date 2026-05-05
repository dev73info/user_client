<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  DataAnalysis,
  Wallet,
  Money,
  Document,
  CreditCard,
  Box,
  MagicStick,
  List,
  Connection,
  Link,
  Files,
  User,
  SwitchButton,
} from '@element-plus/icons-vue'

import { useAuthStore } from '@dev/stores/auth'
import { useBreakpoint } from '@dev/composables/useBreakpoint'
import { getProfileSubscriptions, updateProfileSubscriptions } from '@dev/api/settings'
import { DEV_PORTAL_URL, buildUnifiedAuthUrl } from '@/config/runtime'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { isMobile } = useBreakpoint()

auth.hydrate()

const mobileMenuOpen = ref(false)
const subscribeDevHallDepositPaid = ref(false)
const subscriptionLoading = ref(false)
const subscriptionSaving = ref(false)
const lastSyncedSubscription = ref(false)

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

async function loadDevHallSubscription() {
  if (!auth.isAuthed || !auth.token.trim()) {
    return
  }

  subscriptionLoading.value = true
  try {
    const subscriptions = await getProfileSubscriptions(auth.token)
    const enabled = Boolean(subscriptions.subscribe_dev_hall_deposit_paid)
    subscribeDevHallDepositPaid.value = enabled
    lastSyncedSubscription.value = enabled
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '加载接单提醒订阅失败')
  } finally {
    subscriptionLoading.value = false
  }
}

async function handleDevHallSubscriptionChange(value: string | number | boolean) {
  if (!auth.isAuthed || !auth.token.trim()) {
    subscribeDevHallDepositPaid.value = false
    return
  }

  const enabled = Boolean(value)
  subscriptionSaving.value = true
  try {
    const updated = await updateProfileSubscriptions(auth.token, {
      subscribe_dev_hall_deposit_paid: enabled,
    })
    const synced = Boolean(updated.subscribe_dev_hall_deposit_paid)
    subscribeDevHallDepositPaid.value = synced
    lastSyncedSubscription.value = synced
    ElMessage.success(synced ? '已开启接单提醒订阅' : '已关闭接单提醒订阅')
  } catch (err) {
    subscribeDevHallDepositPaid.value = lastSyncedSubscription.value
    ElMessage.error(err instanceof Error ? err.message : '保存接单提醒订阅失败')
  } finally {
    subscriptionSaving.value = false
  }
}

onMounted(() => {
  void auth.initializeSession().then(() => {
    void loadDevHallSubscription()
  }).catch(() => {
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

        <el-menu :default-active="route.path" :default-openeds="['resources']" router class="dev-shell__menu">
          <el-menu-item index="/dev/overview">
            <el-icon>
              <DataAnalysis />
            </el-icon>
            <span>开发概览</span>
          </el-menu-item>
          <!-- 钱包：暂时禁用 -->
          <el-menu-item disabled class="dev-shell__menu-item--disabled">
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
          <!-- 需求大厅：暂时禁用 -->
          <el-menu-item disabled class="dev-shell__menu-item--disabled">
            <el-icon>
              <Connection />
            </el-icon>
            <span>需求大厅<em class="dev-shell__menu-tag">暂未开放</em></span>
          </el-menu-item>
        </el-menu>

        <div class="dev-shell__aside-footer">
          <el-icon class="dev-shell__aside-footer-icon">
            <User />
          </el-icon>
          <span class="dev-shell__aside-footer-name">{{ auth.username || '开发者' }}</span>
          <button type="button" class="dev-shell__aside-logout" title="退出登录" @click="logout">
            <el-icon>
              <SwitchButton />
            </el-icon>
          </button>
        </div>
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
          <div class="dev-shell__header-actions">
            <div class="dev-shell__subscription">
              <span class="dev-shell__subscription-label">接单提醒订阅</span>
              <el-switch v-model="subscribeDevHallDepositPaid" inline-prompt active-text="开" inactive-text="关"
                :disabled="subscriptionLoading || subscriptionSaving" @change="handleDevHallSubscriptionChange" />
            </div>
          </div>
        </template>
      </el-header>

      <el-main class="dev-shell__main">
        <el-scrollbar class="dev-shell__main-scrollbar">
          <div class="dev-route-view dev-route-view--shell" :class="{ 'dev-route-view--mobile': isMobile }">
            <router-view />
          </div>
        </el-scrollbar>
        <footer class="dev-compliance-footer dev-shell__icp-footer" aria-label="网站备案信息">
          <p>
            ICP备案号：
            <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">滇ICP备2026006119号-2</a>
          </p>
          <p>
            公安备案号：
            <a class="dev-public-security-beian-link"
              href="https://beian.mps.gov.cn/#/query/webSearch?code=53062802000020" target="_blank"
              rel="noopener noreferrer">
              <img class="dev-public-security-beian-icon" src="/icons/beian.png" alt="公安备案图标" />
              <span>滇公网安备53062802000020号</span>
            </a>
          </p>
        </footer>
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

        <el-menu :default-active="route.path" :default-openeds="['resources']" router class="dev-shell__menu">
          <el-menu-item index="/dev/overview">
            <el-icon>
              <DataAnalysis />
            </el-icon>
            <span>开发概览</span>
          </el-menu-item>
          <!-- 钱包：暂时禁用 -->
          <el-menu-item disabled class="dev-shell__menu-item--disabled">
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
          <!-- 需求大厅：暂时禁用 -->
          <el-menu-item disabled class="dev-shell__menu-item--disabled">
            <el-icon>
              <Connection />
            </el-icon>
            <span>需求大厅<em class="dev-shell__menu-tag">暂未开放</em></span>
          </el-menu-item>
        </el-menu>

        <div class="dev-shell__aside-footer">
          <el-icon class="dev-shell__aside-footer-icon">
            <User />
          </el-icon>
          <span class="dev-shell__aside-footer-name">{{ auth.username || '开发者' }}</span>
          <button type="button" class="dev-shell__aside-logout" title="退出登录" @click="logout">
            <el-icon>
              <SwitchButton />
            </el-icon>
          </button>
        </div>
      </div>
    </el-drawer>
  </el-container>
</template>
