<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import HomeHeroSection from '@/components/home/HomeHeroSection.vue'
import AuthModal from '@/components/AuthModal.vue'
import { useAuthForm } from '@/composables/useAuthForm'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const { showToast } = useToast()
const menuOpen = ref(false)
const heroNavLinks = computed(() => {
  const links = [
    { label: '返回首页', to: { name: 'home' } },
    { label: 'MC 插件与模组', to: { name: 'mc-plugins-java' }, active: true },
    { label: '探索', href: '#' },
    { label: '免费资源', href: '#' },
    { label: '社区', href: '#' },
  ]

  if (auth.isAuthed) {
    links.splice(2, 0, { label: '我的定制资源', to: { name: 'my-custom-resources' } })
  }

  return links
})

const currentPlatformLabel = computed(() => (route.name === 'mc-plugins-java' ? 'Java 版' : '基岩版'))
const authVisible = ref(false)
const authMode = ref<'login' | 'register' | 'reset'>('login')
const githubLoginLoading = ref(false)
const {
  authUsername,
  authPassword,
  authEmail,
  authEmailCode,
  acceptTerms,
  sendCodeLoading,
  sendCodeCountdown,
  resetAuthForm,
  loginWithGithub: loginWithGithubAction,
  sendAuthCode,
  submitAuth: submitAuthAction,
  changeAuthMode,
} = useAuthForm(authMode)

const authTitle = computed(() => {
  if (authMode.value === 'login') return '登录账号'
  if (authMode.value === 'register') return '注册账号'
  return '找回密码'
})

function openAuth(mode: 'login' | 'register' | 'reset') {
  authMode.value = mode
  resetAuthForm()
  authVisible.value = true
}

function closeAuth() {
  authVisible.value = false
}

async function handleLoginWithGithub() {
  if (githubLoginLoading.value || auth.loading) {
    return
  }

  githubLoginLoading.value = true
  try {
    await loginWithGithubAction()
  } finally {
    githubLoginLoading.value = false
  }
}

async function handleSubmitAuth() {
  const result = await submitAuthAction()
  if (result) {
    closeAuth()
  }
}

function toggleUserMenu() {
  menuOpen.value = !menuOpen.value
}

function closeUserMenu() {
  menuOpen.value = false
}

function togglePlatform() {
  if (route.name === 'mc-plugins-java') {
    router.push({ name: 'mc-plugins-bedrock' })
  } else {
    router.push({ name: 'mc-plugins-java' })
  }
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

onMounted(() => {
  auth.hydrate()
})
</script>

<template>
  <main class="page-shell custom-page-shell">
    <HomeHeroSection :isAuthed="auth.isAuthed" :username="auth.username" :menuOpen="menuOpen" :navLinks="heroNavLinks"
      @open-auth="openAuth" @toggle-user-menu="toggleUserMenu" @go-profile="goProfile" @logout="logout">
      <div class="hero-meta">
        <div class="hero">
          <h1>MC 插件与模组</h1>
          <p class="desc">浏览最新的 {{ currentPlatformLabel }} 插件与模组，支持多维筛选与快速下载。</p>
        </div>
        <div class="hero-actions">
          <button class="platform-button" :class="currentPlatformLabel === 'Java 版' ? 'is-java' : 'is-bedrock'"
            type="button" @click="togglePlatform()">
            <span class="platform-icon">{{ currentPlatformLabel === 'Java 版' ? '☕' : '🧱' }}</span>
            切换到 {{ currentPlatformLabel === 'Java 版' ? '基岩版' : 'Java 版' }}
          </button>
        </div>
      </div>
    </HomeHeroSection>
    <AuthModal :visible="authVisible" :authMode="authMode" :authTitle="authTitle" v-model:authUsername="authUsername"
      v-model:authPassword="authPassword" v-model:authEmail="authEmail" v-model:authEmailCode="authEmailCode"
      v-model:acceptTerms="acceptTerms" :authLoading="auth.loading" :githubLoginLoading="githubLoginLoading"
      :sendCodeLoading="sendCodeLoading" :sendCodeCountdown="sendCodeCountdown" @close="closeAuth"
      @submit="handleSubmitAuth" @loginWithGithub="handleLoginWithGithub" @sendAuthCode="sendAuthCode"
      @change-mode="changeAuthMode" />
    <router-view />
  </main>
</template>
