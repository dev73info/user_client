<script setup lang="ts">
import { computed, ref, onBeforeUnmount, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import '../styles/McPluginsView.css'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const { showToast } = useToast()
const userMenuWrapper = ref<HTMLElement | null>(null)
const menuOpen = ref(false)

const isJavaPage = computed(() => route.name === 'mc-plugins-java')
const currentPlatformLabel = computed(() => (isJavaPage.value ? 'Java 版' : '基岩版'))
const currentPlatformIcon = computed(() => (isJavaPage.value ? '☕' : '🧱'))

function togglePlatform() {
  if (isJavaPage.value) {
    router.push({ name: 'mc-plugins-bedrock' })
  } else {
    router.push({ name: 'mc-plugins-java' })
  }
}

function toggleUserMenu() {
  menuOpen.value = !menuOpen.value
}

function closeUserMenu() {
  menuOpen.value = false
}

function goProfile() {
  closeUserMenu()
  router.push({ name: 'profile' })
}

function logout() {
  auth.logout()
  closeUserMenu()
  showToast('已退出登录', 'info')
}

function handleClickOutside(event: MouseEvent) {
  if (!menuOpen.value) {
    return
  }
  const target = event.target as Node | null
  if (userMenuWrapper.value && target && !userMenuWrapper.value.contains(target)) {
    closeUserMenu()
  }
}

onMounted(() => {
  window.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
  window.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <main class="mc-layout">
    <header class="mc-header">
      <div class="mc-header-left">
        <button class="mc-logo-btn" @click="router.push('/')">返回首页</button>
        <button class="platform-button" :class="isJavaPage ? 'is-java' : 'is-bedrock'" type="button"
          @click="togglePlatform()">
          <span class="platform-icon">{{ currentPlatformIcon }}</span>
          <span class="platform-text">{{ currentPlatformLabel }}</span>
        </button>
      </div>
      <nav class="mc-nav-links">
        <a href="#">探索</a>
        <a href="#">免费资源</a>
        <a href="#">社区</a>
      </nav>
      <div class="mc-user-area">
        <template v-if="!auth.isAuthed">
          <button class="auth-btn ghost" type="button" @click="router.push('/profile')">登录</button>
        </template>
        <template v-else>
          <div class="user-menu-wrapper" ref="userMenuWrapper">
            <button class="auth-btn user-pill" type="button" @click.stop="toggleUserMenu" title="用户菜单">
              {{ auth.username || '已登录用户' }}
            </button>
            <div class="user-menu" :class="{ open: menuOpen }" aria-label="用户菜单">
              <button class="user-menu-item" type="button" @click="goProfile">个人中心</button>
              <div class="menu-divider"></div>
              <button class="user-menu-item danger" type="button" @click="logout">退出登录</button>
            </div>
          </div>
        </template>
      </div>
    </header>

    <router-view />
  </main>
</template>
