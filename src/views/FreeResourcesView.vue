<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppToast from '@/components/AppToast.vue'
import HomeFreeResourceBoard from '@/components/home/HomeFreeResourceBoard.vue'
import HomeHeroSection from '@/components/home/HomeHeroSection.vue'
import { getProcessedTagTree, type McTagCatalogRoot } from '@/api/resourceTags'
import { buildDevPortalUrl } from '@/config/runtime'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'

type FreeResourceSectionView = {
  rootId: number
  rootName: string
  rootSlug: string
  entrySlug: string | null
  summary: string
  actionLabel: string
}

const auth = useAuthStore()
const router = useRouter()
const menuOpen = ref(false)
const freeResourceSections = ref<FreeResourceSectionView[]>([])
const freeResourceLoading = ref(false)
const { toastVisible, toastMessage, toastType, showToast, hideToast } = useToast()

const heroNavLinks = computed(() => {
  const links: Array<{ label: string; to?: { name: string }; href?: string; active?: boolean; align?: 'left' | 'right' }> = [
    { label: '返回首页', to: { name: 'home' } },
    { label: '开发者端', href: buildDevPortalUrl(auth.token) },
    { label: '免费资源导航', to: { name: 'free-resources' }, active: true },
  ]

  if (auth.isAuthed) {
    links.push({ label: '我的定制资源', to: { name: 'my-custom-resources' }, align: 'right' })
  }

  return links
})

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

function openAuth(mode: 'login' | 'register') {
  router.push({ name: 'home', query: { modal: 'auth', mode } })
}

function logout() {
  auth.logout()
  showToast('已退出登录', 'info')
}

function buildFreeResourceSummary(root: McTagCatalogRoot) {
  const entryCount = root.entries.length
  const tagCount = root.entries.reduce(
    (sum, entry) => sum + entry.publish_groups.reduce((innerSum, group) => innerSum + group.items.length, 0),
    0,
  )
  const childNames = root.entries.map((entry) => entry.label)

  if (entryCount <= 0 && tagCount <= 0) {
    return '当前根节点下还没有公开标签内容。'
  }

  if (childNames.length > 0) {
    const previewNames = childNames.slice(0, 3).join(' / ')
    return `下含 ${previewNames}${childNames.length > 3 ? ' 等分区' : ''}。`
  }

  if (tagCount <= 0) {
    return `包含 ${entryCount} 个下级分组。`
  }

  return `包含 ${entryCount} 个下级分组，覆盖 ${tagCount} 个标签节点。`
}

async function loadFreeResourceSections() {
  freeResourceLoading.value = true
  try {
    const tree = await getProcessedTagTree()
    freeResourceSections.value = tree.roots.map((root, index): FreeResourceSectionView => {
      const hasContent = root.entries.length > 0
      return {
        rootId: index,
        rootName: root.label,
        rootSlug: root.key,
        entrySlug: root.first_entry_key,
        summary: buildFreeResourceSummary(root),
        actionLabel: hasContent ? '进入分区' : '即将开放',
      }
    })
  } catch (err) {
    showToast(err instanceof Error ? err.message : '加载免费资源导航失败', 'warning')
  } finally {
    freeResourceLoading.value = false
  }
}

function openFreeResourceRoot(section: FreeResourceSectionView) {
  router.push({
    name: 'resource-catalog',
    params: section.entrySlug
      ? { rootSlug: section.rootSlug, entrySlug: section.entrySlug }
      : { rootSlug: section.rootSlug },
  })
}

onMounted(() => {
  auth.hydrate()
  void loadFreeResourceSections()
})
</script>

<template>
  <main class="page-shell">
    <HomeHeroSection :isAuthed="auth.isAuthed" :username="auth.username" :menuOpen="menuOpen" :navLinks="heroNavLinks"
      @open-auth="openAuth" @toggle-user-menu="toggleUserMenu" @go-profile="goProfile" @logout="logout">
      <div class="hero-meta">
        <div class="hero">
          <h1>免费资源</h1>
          <p class="desc">查看平台当前公开的免费资源根分区入口，按分类快速进入对应资源目录。</p>
        </div>
      </div>
    </HomeHeroSection>

    <HomeFreeResourceBoard :sections="freeResourceSections" :loading="freeResourceLoading"
      @open-section="openFreeResourceRoot" />

    <AppToast :visible="toastVisible" :message="toastMessage" :type="toastType" @close="hideToast" />
  </main>
</template>
