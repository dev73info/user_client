<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Bell, TIcon } from 'ui_73info'

import PortalNavLinks from '@/components/portal-nav/PortalNavLinks.vue'
import PortalSearchBox from '@/components/portal-nav/PortalSearchBox.vue'
import PortalUserMenu from '@/components/portal-nav/PortalUserMenu.vue'
import { usePortalHeaderFootprint } from '@/composables/usePortalHeaderFootprint'
import { usePortalMenuDismiss, usePortalSubscription } from '@/composables/usePortalSubscription'
import { usePortalTopNavNav } from '@/composables/usePortalTopNavNav'
import { useAuthStore } from '@/stores/auth'

// 本组件只剩骨架：品牌、导航、工具栏里的订阅铃与登录按钮。
// 搜索（含范围下拉）、用户胶囊菜单、订阅状态、导航与路由出口分别在
// `composables/usePortalTopNavSearch.ts`、`components/portal-nav/` 与
// `composables/usePortalSubscription.ts`、`usePortalTopNavNav.ts` 里。
//
// 两条跨文件契约别动：
// 1. 根元素必须继续叫 `.portal-header` —— `composables/useCodeBlockCopy.ts` 靠它读几何位置；
// 2. `--portal-header-footprint` 必须继续被写 —— 工作台侧栏拿它当 sticky 偏移。
const auth = useAuthStore()
const route = useRoute()
const { headerRef } = usePortalHeaderFootprint()
const { isDeveloperArea, headerLinks, openAuth, goWorkbench, openDevWorkbench, logout } =
  usePortalTopNavNav()
const {
  bellTitle,
  hasActiveSubscription,
  subscriptionBusy,
  subscriptionMenuOpen,
  officialActivitySubscriptionEnabled,
  devHallSubscriptionEnabled,
  userAvatarSrc,
  handleUserAvatarError,
  closeMenu,
  openSubscriptionMenu,
  handleBellClick,
  toggleSubscription,
} = usePortalSubscription({ openAuth })

const userMenuOpen = ref(false)

// 用户胶囊菜单的「点外部关闭」：与搜索范围、订阅菜单共用同一套逻辑，只是这里只关了
// 自己那一块，也不监听 Esc（原本就没有）
usePortalMenuDismiss({ rootSelector: '.portal-user', close: closeUserMenu, closeOnEscape: false })

// 换路由时把还开着的下拉收起来（搜索范围菜单由搜索 composable 自己收）
watch(
  () => route.fullPath,
  () => {
    closeUserMenu()
    closeMenu()
  },
)

function closeUserMenu() {
  userMenuOpen.value = false
}

function toggleUserMenu() {
  userMenuOpen.value = !userMenuOpen.value
}

// 菜单里点「工作台 / 退出登录」：先收起菜单，再把路由交给导航出口
function goWorkbenchFromMenu() {
  closeUserMenu()
  goWorkbench()
}

function logoutFromMenu() {
  closeUserMenu()
  logout()
}
</script>

<template>
  <header ref="headerRef" class="portal-header" :class="{ 'portal-header--dev': isDeveloperArea }">
    <RouterLink class="portal-brand" :to="{ name: 'home' }">
      <img class="portal-brand__mark" src="/icons/home-icon.svg" alt="73info 首页" />
      <div class="portal-brand__copy">
        <strong>73info.cn</strong>
      </div>
    </RouterLink>

    <PortalNavLinks :links="headerLinks" />

    <div class="portal-header__tools">
      <RouterLink class="portal-search-menu" :to="{ name: 'community' }"> 社区 </RouterLink>
      <PortalSearchBox :open-auth="openAuth" :open-dev-workbench="openDevWorkbench" />
      <div class="portal-subscription" @click.stop>
        <button
          class="portal-icon-btn portal-icon-btn--subscription"
          :class="{
            'is-active': hasActiveSubscription,
            'is-loading': subscriptionBusy,
            'is-menu-open': subscriptionMenuOpen,
          }"
          type="button"
          :aria-label="bellTitle"
          :aria-pressed="hasActiveSubscription"
          :title="bellTitle"
          @click="handleBellClick"
          @contextmenu.prevent="openSubscriptionMenu"
        >
          <TIcon>
            <Bell />
          </TIcon>
        </button>

        <section
          v-if="subscriptionMenuOpen"
          class="portal-subscription-menu"
          role="menu"
          aria-label="消息订阅设置"
          @contextmenu.prevent
        >
          <header class="portal-subscription-menu__head">
            <strong>消息订阅</strong>
          </header>
          <button
            class="portal-subscription-item"
            :class="{ active: officialActivitySubscriptionEnabled }"
            type="button"
            role="menuitemcheckbox"
            :aria-checked="officialActivitySubscriptionEnabled"
            :disabled="subscriptionBusy"
            @click="toggleSubscription('official_activity')"
          >
            <span class="portal-subscription-item__copy">
              <strong>官方活动通知</strong>
              <small>平台公告、活动与福利提醒</small>
            </span>
            <span class="portal-subscription-item__state">{{
              officialActivitySubscriptionEnabled ? '开' : '关'
            }}</span>
          </button>
          <button
            class="portal-subscription-item"
            :class="{ active: devHallSubscriptionEnabled }"
            type="button"
            role="menuitemcheckbox"
            :aria-checked="devHallSubscriptionEnabled"
            :disabled="subscriptionBusy"
            @click="toggleSubscription('dev_hall_deposit_paid')"
          >
            <span class="portal-subscription-item__copy">
              <strong>开发者接单提醒</strong>
              <small>需求托管付款后提醒开发者</small>
            </span>
            <span class="portal-subscription-item__state">{{
              devHallSubscriptionEnabled ? '开' : '关'
            }}</span>
          </button>
        </section>
      </div>
      <template v-if="!auth.isAuthed">
        <button class="portal-text-btn" type="button" @click="openAuth('login')">登录</button>
        <button class="portal-solid-btn" type="button" @click="openAuth('register')">注册</button>
      </template>
      <PortalUserMenu
        v-else
        :open="userMenuOpen"
        :username="auth.username"
        :avatar-src="userAvatarSrc"
        @toggle="toggleUserMenu"
        @workbench="goWorkbenchFromMenu"
        @logout="logoutFromMenu"
        @avatar-error="handleUserAvatarError"
      />
    </div>
  </header>
</template>

<style scoped src="./portal-top-nav-bar.css"></style>

<style scoped src="./portal-top-nav-actions.css"></style>
