<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import ResourceCatalog from '@/components/ResourceCatalog.vue'
import { useAuthStore } from '@/stores/auth'
import {
  getMcPluginPlatformEntries,
  getProcessedTagTree,
  getTagRouteSlug,
  type McPluginPlatformEntry,
  type McProcessedTagTree,
} from '@/api/resourceTags'
import { useToast } from '@/composables/useToast'
import HomeHeroSection from '@/components/home/HomeHeroSection.vue'
import AuthModal from '@/components/AuthModal.vue'
import { useAuthForm } from '@/composables/useAuthForm'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const { showToast } = useToast()
const menuOpen = ref(false)
const rootTabs = ref<Array<{ slug: string; label: string; firstEntrySlug: string | null }>>([])
const platformTabs = ref<McPluginPlatformEntry[]>([])
const currentRootName = ref('')
const heroNavLinks = computed(() => {
  const links: Array<{
    label: string
    to?: { name: string; params?: Record<string, string> }
    active?: boolean
    align?: 'left' | 'right'
  }> = [
      { label: '返回首页', to: { name: 'home' } },
      {
        label: '免费资源',
        to: {
          name: 'resource-catalog',
          params: currentRootSlug.value
            ? (currentEntrySlug.value
              ? { rootSlug: currentRootSlug.value, entrySlug: currentEntrySlug.value }
              : { rootSlug: currentRootSlug.value })
            : {},
        },
        active: true,
      },
    ]

  if (auth.isAuthed) {
    links.push({ label: '我的定制资源', to: { name: 'my-custom-resources' }, align: 'right' })
  }

  return links
})
const currentRootSlug = computed(() => {
  const raw = route.params.rootSlug
  return typeof raw === 'string' ? getTagRouteSlug(raw) : ''
})
const currentEntrySlug = computed(() => {
  const raw = route.params.entrySlug
  return typeof raw === 'string' ? getTagRouteSlug(raw) : ''
})
const currentTab = computed(() => {
  return platformTabs.value.find((tab) => tab.slug === currentEntrySlug.value) ?? platformTabs.value[0] ?? null
})
const currentPlatform = computed(() => currentTab.value?.platform ?? '')
const currentEntryLabel = computed(() => currentTab.value?.groupName ?? '当前分区')
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

function openPlatform(entrySlug: string) {
  if (entrySlug === currentEntrySlug.value) {
    return
  }

  router.push({ name: 'resource-catalog', params: { rootSlug: currentRootSlug.value, entrySlug } })
}

function openRoot(rootSlug: string, firstEntrySlug: string | null) {
  if (rootSlug === currentRootSlug.value) {
    return
  }

  router.push({
    name: 'resource-catalog',
    params: firstEntrySlug ? { rootSlug, entrySlug: firstEntrySlug } : { rootSlug },
  })
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
  void loadPlatformTabs()
})

watch(
  () => [currentRootSlug.value, currentEntrySlug.value],
  () => {
    void loadPlatformTabs()
  },
)

async function loadPlatformTabs() {
  try {
    const tree = await getProcessedTagTree()

    rootTabs.value = tree.roots.map((root) => ({
      slug: root.key,
      label: root.label,
      firstEntrySlug: root.first_entry_key,
    }))

    const resolvedRoot = resolveCurrentRoot(tree)
    if (!resolvedRoot) {
      rootTabs.value = []
      platformTabs.value = []
      currentRootName.value = ''
      return
    }

    currentRootName.value = resolvedRoot.label
    platformTabs.value = getMcPluginPlatformEntries(tree, resolvedRoot.key)

    const firstTab = platformTabs.value[0]
    if (!firstTab) {
      return
    }

    if (
      currentRootSlug.value !== resolvedRoot.key
      || !platformTabs.value.some((tab) => tab.slug === currentEntrySlug.value)
    ) {
      await router.replace({
        name: 'resource-catalog',
        params: { rootSlug: resolvedRoot.key, entrySlug: firstTab.slug },
        query: route.query,
      })
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : '加载免费资源目录失败', 'warning')
  }
}

function resolveCurrentRoot(tree: McProcessedTagTree) {
  if (currentRootSlug.value) {
    const matched = tree.roots.find((r) => r.key === currentRootSlug.value)
    if (matched) return matched
  }

  return tree.roots.find((r) => r.entries.length > 0) ?? tree.roots[0] ?? null
}
</script>

<template>
  <main class="page-shell custom-page-shell">
    <HomeHeroSection :isAuthed="auth.isAuthed" :username="auth.username" :menuOpen="menuOpen" :navLinks="heroNavLinks"
      @open-auth="openAuth" @toggle-user-menu="toggleUserMenu" @go-profile="goProfile" @logout="logout">
      <div class="catalog-nav-stack">
        <section class="catalog-nav-row" aria-label="根节点导航">
          <div class="catalog-nav-row__header">
            <span class="catalog-nav-row__label">根节点</span>
            <span class="catalog-nav-row__meta">切换资源大类</span>
          </div>
          <div class="hero-root-nav">
            <button v-for="root in rootTabs" :key="root.slug" class="root-node-chip"
              :class="{ active: root.slug === currentRootSlug }" type="button"
              @click="openRoot(root.slug, root.firstEntrySlug)">
              {{ root.label }}
            </button>
          </div>
        </section>
        <section class="catalog-nav-row" aria-label="二级节点导航">
          <div class="catalog-nav-row__header">
            <span class="catalog-nav-row__label">二级节点</span>
            <span class="catalog-nav-row__meta">当前：{{ currentEntryLabel }}</span>
          </div>
          <div class="hero-actions hero-actions--catalog">
            <button v-for="tab in platformTabs" :key="tab.slug" class="platform-path-chip"
              :class="{ active: tab.slug === currentEntrySlug }" type="button" @click="openPlatform(tab.slug)">
              <span class="platform-path-chip__label">{{ tab.groupName }}</span>
            </button>
          </div>
        </section>
      </div>
    </HomeHeroSection>
    <AuthModal :visible="authVisible" :authMode="authMode" :authTitle="authTitle" v-model:authUsername="authUsername"
      v-model:authPassword="authPassword" v-model:authEmail="authEmail" v-model:authEmailCode="authEmailCode"
      v-model:acceptTerms="acceptTerms" :authLoading="auth.loading" :githubLoginLoading="githubLoginLoading"
      :sendCodeLoading="sendCodeLoading" :sendCodeCountdown="sendCodeCountdown" @close="closeAuth"
      @submit="handleSubmitAuth" @loginWithGithub="handleLoginWithGithub" @sendAuthCode="sendAuthCode"
      @change-mode="changeAuthMode" />
    <ResourceCatalog :platform="currentPlatform" :rootSlug="currentRootSlug"
      :groupName="currentTab?.groupName || currentEntryLabel" />
  </main>
</template>
