<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Bell, Close, Search } from '@element-plus/icons-vue'

import { useAuthStore } from '@/stores/auth'
import { buildDevPortalUrl } from '@/config/runtime'
import { useToast } from '@/composables/useToast'
import { getProfileSubscriptions, updateProfileSubscriptions } from '@dev/api/settings'

type AuthMode = 'login' | 'register'
type SearchScope = 'auto' | 'resources' | 'requirements' | 'community'

type HeaderLink = {
  label: string
  to?: { name: string }
  href?: string
  active?: boolean
}

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const { showToast } = useToast()
const menuOpen = ref(false)
const searchQuery = ref('')
const searchScope = ref<SearchScope>('auto')
const searchScopeMenuOpen = ref(false)
const searchInputFocused = ref(false)
const searchInputHovered = ref(false)
const searchDraftFilled = ref(false)
const officialActivitySubscriptionEnabled = ref(false)
const devHallSubscriptionEnabled = ref(false)
const subscriptionMenuOpen = ref(false)
const subscriptionLoading = ref(false)
const subscriptionSaving = ref(false)
const lastSyncedSubscriptions = ref({
  subscribe_official_activity: false,
  subscribe_dev_hall_deposit_paid: false,
})
const authModalVisible = computed(() => route.query.modal === 'auth')
const searchHasInputValue = computed(
  () => Boolean(searchQuery.value.trim()) || searchDraftFilled.value,
)
const isDeveloperArea = computed(
  () => route.path.startsWith('/dev') || route.path.startsWith('/workbench/developer'),
)
const subscriptionBusy = computed(() => subscriptionLoading.value || subscriptionSaving.value)
const hasActiveSubscription = computed(
  () => officialActivitySubscriptionEnabled.value || devHallSubscriptionEnabled.value,
)
const allSubscriptionsEnabled = computed(
  () => officialActivitySubscriptionEnabled.value && devHallSubscriptionEnabled.value,
)
const bellTitle = computed(() => {
  if (subscriptionBusy.value) {
    return '消息订阅同步中'
  }

  return allSubscriptionsEnabled.value ? '关闭全部消息订阅' : '开启全部消息订阅'
})
const searchScopeOptions: Array<{ value: SearchScope; label: string }> = [
  { value: 'auto', label: '全部' },
  { value: 'resources', label: '资源' },
  { value: 'requirements', label: '需求' },
  { value: 'community', label: '社区' },
]
const searchableRouteScope: Partial<Record<string, SearchScope>> = {
  search: 'auto',
  'free-resources': 'resources',
  'resource-catalog': 'resources',
  'resource-detail-direct': 'resources',
  'requirement-hall': 'requirements',
  community: 'community',
  'community-post': 'community',
}
const searchPlaceholder = computed(() => {
  if (searchScope.value === 'resources') return '搜索公开资源...'
  if (searchScope.value === 'requirements') return '搜索需求标题、编号...'
  if (searchScope.value === 'community') return '搜索社区帖子...'
  return '搜索资源、需求、社区...'
})
const activeSearchScopeLabel = computed(
  () => searchScopeOptions.find((option) => option.value === searchScope.value)?.label ?? '全部',
)

const headerLinks = computed<HeaderLink[]>(() => {
  const currentName = String(route.name ?? '')
  const allowActive = !authModalVisible.value

  const links: HeaderLink[] = [
    { label: '首页', to: { name: 'home' }, active: allowActive && currentName === 'home' },
    {
      label: '免费资源',
      to: { name: 'free-resources' },
      active:
        allowActive &&
        (currentName === 'free-resources' ||
          currentName === 'resource-catalog' ||
          currentName === 'resource-detail'),
    },
    {
      label: '需求大厅',
      to: { name: 'requirement-hall' },
      active: allowActive && (currentName === 'requirement-hall' || currentName === 'payment'),
    },
    {
      label: '社区',
      to: { name: 'community' },
      active: allowActive && currentName === 'community',
    },
  ]

  if (auth.isAuthed) {
    links.splice(3, 0, {
      label: '工作台',
      to: { name: 'workbench' },
      active: allowActive && route.path.startsWith('/workbench'),
    })
    links.push({
      label: '🎁 邀请有礼',
      to: { name: 'workbench-invite' },
      active:
        allowActive &&
        (currentName === 'workbench-invite' || currentName === 'workbench-invite-leaderboard'),
    })
  }

  return links
})

watch(
  () => route.fullPath,
  () => {
    menuOpen.value = false
    subscriptionMenuOpen.value = false
    searchScopeMenuOpen.value = false
    syncSearchFromRoute()
  },
  { immediate: true },
)

watch(
  () => [auth.isAuthed, auth.token] as const,
  ([isAuthed, token]) => {
    if (!isAuthed || !token.trim()) {
      resetSubscriptionState()
      return
    }

    void loadProfileSubscriptions()
  },
  { immediate: true },
)

onMounted(() => {
  document.addEventListener('click', closeSubscriptionMenu)
  document.addEventListener('click', closeSearchScopeMenu)
  document.addEventListener('keydown', handleSubscriptionMenuKeydown)
  document.addEventListener('keydown', handleSearchScopeMenuKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', closeSubscriptionMenu)
  document.removeEventListener('click', closeSearchScopeMenu)
  document.removeEventListener('keydown', handleSubscriptionMenuKeydown)
  document.removeEventListener('keydown', handleSearchScopeMenuKeydown)
})

function resetSubscriptionState() {
  officialActivitySubscriptionEnabled.value = false
  devHallSubscriptionEnabled.value = false
  subscriptionMenuOpen.value = false
  lastSyncedSubscriptions.value = {
    subscribe_official_activity: false,
    subscribe_dev_hall_deposit_paid: false,
  }
}

function syncSubscriptionState(subscriptions: {
  subscribe_official_activity: boolean
  subscribe_dev_hall_deposit_paid: boolean
}) {
  const officialEnabled = Boolean(subscriptions.subscribe_official_activity)
  const devHallEnabled = Boolean(subscriptions.subscribe_dev_hall_deposit_paid)

  officialActivitySubscriptionEnabled.value = officialEnabled
  devHallSubscriptionEnabled.value = devHallEnabled
  lastSyncedSubscriptions.value = {
    subscribe_official_activity: officialEnabled,
    subscribe_dev_hall_deposit_paid: devHallEnabled,
  }
}

async function loadProfileSubscriptions() {
  if (!auth.isAuthed || !auth.token.trim()) {
    return
  }

  subscriptionLoading.value = true
  try {
    const subscriptions = await getProfileSubscriptions(auth.token)
    syncSubscriptionState(subscriptions)
  } catch (err) {
    showToast(err instanceof Error ? err.message : '加载消息订阅失败', 'error')
  } finally {
    subscriptionLoading.value = false
  }
}

function closeSubscriptionMenu() {
  subscriptionMenuOpen.value = false
}

function closeSearchScopeMenu() {
  searchScopeMenuOpen.value = false
}

function handleSubscriptionMenuKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closeSubscriptionMenu()
  }
}

function handleSearchScopeMenuKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closeSearchScopeMenu()
  }
}

function toggleSearchScopeMenu() {
  searchScopeMenuOpen.value = !searchScopeMenuOpen.value
}

function selectSearchScope(scope: SearchScope) {
  searchScope.value = scope
  searchScopeMenuOpen.value = false
}

function openSubscriptionMenu() {
  if (!auth.isAuthed || !auth.token.trim()) {
    openAuth('login')
    return
  }

  subscriptionMenuOpen.value = true

  if (!subscriptionLoading.value) {
    void loadProfileSubscriptions()
  }
}

function handleBellClick() {
  void toggleAllSubscriptions()
}

async function toggleAllSubscriptions() {
  if (!auth.isAuthed || !auth.token.trim()) {
    openAuth('login')
    return
  }

  if (subscriptionBusy.value) {
    return
  }

  const nextEnabled = !allSubscriptionsEnabled.value
  const nextState = {
    subscribe_official_activity: nextEnabled,
    subscribe_dev_hall_deposit_paid: nextEnabled,
  }

  officialActivitySubscriptionEnabled.value = nextEnabled
  devHallSubscriptionEnabled.value = nextEnabled
  subscriptionSaving.value = true
  try {
    const updated = await updateProfileSubscriptions(auth.token, nextState)
    syncSubscriptionState(updated)
    showToast(nextEnabled ? '已开启全部消息订阅' : '已关闭全部消息订阅', 'success')
  } catch (err) {
    officialActivitySubscriptionEnabled.value =
      lastSyncedSubscriptions.value.subscribe_official_activity
    devHallSubscriptionEnabled.value = lastSyncedSubscriptions.value.subscribe_dev_hall_deposit_paid
    showToast(err instanceof Error ? err.message : '保存消息订阅失败', 'error')
  } finally {
    subscriptionSaving.value = false
  }
}

async function toggleSubscription(type: 'official_activity' | 'dev_hall_deposit_paid') {
  const isOfficialActivity = type === 'official_activity'

  if (!auth.isAuthed || !auth.token.trim()) {
    openAuth('login')
    return
  }

  if (subscriptionBusy.value) {
    return
  }

  const nextEnabled = isOfficialActivity
    ? !officialActivitySubscriptionEnabled.value
    : !devHallSubscriptionEnabled.value

  if (isOfficialActivity) {
    officialActivitySubscriptionEnabled.value = nextEnabled
  } else {
    devHallSubscriptionEnabled.value = nextEnabled
  }

  subscriptionSaving.value = true
  try {
    const updated = await updateProfileSubscriptions(
      auth.token,
      isOfficialActivity
        ? { subscribe_official_activity: nextEnabled }
        : { subscribe_dev_hall_deposit_paid: nextEnabled },
    )
    syncSubscriptionState(updated)
    showToast(
      nextEnabled
        ? `已开启${isOfficialActivity ? '官方活动通知' : '开发者接单提醒'}`
        : `已关闭${isOfficialActivity ? '官方活动通知' : '开发者接单提醒'}`,
      'success',
    )
  } catch (err) {
    officialActivitySubscriptionEnabled.value =
      lastSyncedSubscriptions.value.subscribe_official_activity
    devHallSubscriptionEnabled.value = lastSyncedSubscriptions.value.subscribe_dev_hall_deposit_paid
    showToast(err instanceof Error ? err.message : '保存消息订阅失败', 'error')
  } finally {
    subscriptionSaving.value = false
  }
}

function openAuth(mode: AuthMode) {
  const nextQuery: Record<string, string> = { modal: 'auth', mode }
  const redirectTarget =
    typeof route.query.redirect_to === 'string' ? route.query.redirect_to.trim() : ''

  if (redirectTarget && redirectTarget.startsWith('/') && !redirectTarget.startsWith('//')) {
    nextQuery.redirect_to = redirectTarget
  }

  void router.push({ name: 'home', query: nextQuery })
}

function goWorkbench() {
  menuOpen.value = false
  void router.push({ name: 'workbench' })
}

function openDevWorkbench() {
  menuOpen.value = false
  void router.push(buildDevPortalUrl(auth.token))
}

function logout() {
  menuOpen.value = false
  auth.logout()
  void router.push({ name: 'home' })
}

function syncSearchFromRoute() {
  const currentName = String(route.name ?? '')
  const nextScope = searchableRouteScope[currentName]

  if (!nextScope) {
    searchScope.value = 'auto'
    searchQuery.value = ''
    searchDraftFilled.value = false
    return
  }

  if (currentName === 'search') {
    const routeScope = typeof route.query.scope === 'string' ? route.query.scope : ''
    searchScope.value =
      routeScope === 'resources' || routeScope === 'requirements' ? routeScope : 'auto'
    searchQuery.value = typeof route.query.keyword === 'string' ? route.query.keyword.trim() : ''
    searchDraftFilled.value = Boolean(searchQuery.value)
    return
  }

  const routeKeyword =
    currentName === 'resource-catalog'
      ? typeof route.query.search === 'string'
        ? route.query.search.trim()
        : ''
      : typeof route.query.keyword === 'string'
        ? route.query.keyword.trim()
        : ''

  searchScope.value = nextScope
  searchQuery.value = routeKeyword
  searchDraftFilled.value = Boolean(routeKeyword)
}

function pushResourceSearch(keyword: string) {
  void router.push({ name: 'search', query: { keyword, scope: 'resources' } })
}

function pushRequirementSearch(keyword: string) {
  void router.push({ name: 'search', query: { keyword, scope: 'requirements' } })
}

function pushCommunitySearch(keyword: string) {
  void router.push({ name: 'community', query: { keyword } })
}

function pushScopedSearch(keyword: string) {
  if (searchScope.value === 'resources') {
    pushResourceSearch(keyword)
    return true
  }

  if (searchScope.value === 'requirements') {
    pushRequirementSearch(keyword)
    return true
  }

  if (searchScope.value === 'community') {
    pushCommunitySearch(keyword)
    return true
  }

  return false
}

function submitSearch() {
  const normalized = searchQuery.value.trim()
  if (!normalized) {
    showToast('请输入搜索关键词', 'info')
    return
  }

  searchQuery.value = normalized
  searchDraftFilled.value = true

  if (pushScopedSearch(normalized)) {
    return
  }

  const keyword = normalized.toLowerCase()

  if (/(开发者|接单|发布资源|dev)/.test(keyword)) {
    openDevWorkbench()
    return
  }

  if (/(个人中心|用户工作台|工作台|账户|我的)/.test(keyword)) {
    if (auth.isAuthed) {
      void router.push({ name: 'workbench' })
    } else {
      openAuth('login')
    }
    return
  }

  if (/(需求|定制|项目|招募|外包|预算|验收)/.test(keyword)) {
    pushRequirementSearch(normalized)
    return
  }

  if (/(社区|动态|公告|帮助|帖子|评论|话题|讨论)/.test(keyword)) {
    pushCommunitySearch(normalized)
    return
  }

  void router.push({ name: 'search', query: { keyword: normalized } })
}

function clearSearch() {
  searchQuery.value = ''
  searchDraftFilled.value = false

  const currentName = String(route.name ?? '')
  if (currentName === 'search' && route.query.keyword) {
    const nextQuery = { ...route.query }
    delete nextQuery.keyword
    void router.replace({ query: nextQuery })
    return
  }

  if (currentName === 'resource-catalog' && route.query.search) {
    const nextQuery = { ...route.query }
    delete nextQuery.search
    void router.replace({ query: nextQuery })
    return
  }

  if (['free-resources', 'requirement-hall', 'community'].includes(currentName) && route.query.keyword) {
    const nextQuery = { ...route.query }
    delete nextQuery.keyword
    void router.replace({ query: nextQuery })
  }
}

function updateSearchDraftState(event: Event) {
  const input = event.target as HTMLInputElement | null
  searchDraftFilled.value = Boolean(input?.value.trim())
}

function startSearchComposition() {
  searchDraftFilled.value = true
}

function finishSearchComposition(event: CompositionEvent) {
  updateSearchDraftState(event)
}
</script>

<template>
  <header class="portal-header" :class="{
    'portal-header--dev': isDeveloperArea,
  }">
    <RouterLink class="portal-brand" :to="{ name: 'home' }">
      <img class="portal-brand__mark" src="/icons/home-icon.svg" alt="73info 首页" />
      <div class="portal-brand__copy">
        <strong>73info.cn</strong>
      </div>
    </RouterLink>

    <nav class="portal-nav">
      <template v-for="link in headerLinks" :key="link.label">
        <RouterLink v-if="link.to" :to="link.to" active-class="" exact-active-class="" class="portal-nav__link"
          :class="{ active: link.active }">
          {{ link.label }}
        </RouterLink>
        <a v-else :href="link.href || '#'" class="portal-nav__link">{{ link.label }}</a>
      </template>
    </nav>

    <div class="portal-header__tools">
      <RouterLink class="portal-search-menu" :to="{ name: 'community' }">
        社区
      </RouterLink>
      <form class="portal-search" :class="{
        'is-filled': searchHasInputValue,
        'is-input-focused': searchInputFocused,
        'is-input-hovered': searchInputHovered,
      }" @submit.prevent="submitSearch">
        <div class="portal-search-scope" @click.stop>
          <button class="portal-search-scope__trigger" type="button" aria-haspopup="listbox"
            :aria-expanded="searchScopeMenuOpen" @click="toggleSearchScopeMenu">
            <span>{{ activeSearchScopeLabel }}</span>
          </button>
          <div v-if="searchScopeMenuOpen" class="portal-search-scope__menu" role="listbox" aria-label="搜索范围">
            <button v-for="option in searchScopeOptions" :key="option.value" class="portal-search-scope__option"
              :class="{ active: option.value === searchScope }" type="button" role="option"
              :aria-selected="option.value === searchScope" @click="selectSearchScope(option.value)">
              {{ option.label }}
            </button>
          </div>
        </div>
        <div class="portal-search-field" @mouseenter="searchInputHovered = true"
          @mouseleave="searchInputHovered = false">
          <el-icon>
            <Search />
          </el-icon>
          <input v-model="searchQuery" type="search" inputmode="search" enterkeyhint="search" autocomplete="off"
            spellcheck="false" aria-label="顶部搜索" :placeholder="searchPlaceholder" @input="updateSearchDraftState"
            @compositionstart="startSearchComposition" @compositionupdate="updateSearchDraftState"
            @compositionend="finishSearchComposition" @focus="searchInputFocused = true"
            @blur="searchInputFocused = false" @keydown.esc="clearSearch" />
          <button class="portal-search-clear" :class="{ 'is-visible': Boolean(searchQuery) }" type="button"
            aria-label="清空搜索" :aria-hidden="!searchQuery" :disabled="!searchQuery" :tabindex="searchQuery ? 0 : -1"
            @click="clearSearch">
            <el-icon>
              <Close />
            </el-icon>
          </button>
        </div>
      </form>
      <div class="portal-subscription" @click.stop>
        <button class="portal-icon-btn portal-icon-btn--subscription" :class="{
          'is-active': hasActiveSubscription,
          'is-loading': subscriptionBusy,
          'is-menu-open': subscriptionMenuOpen,
        }" type="button" :aria-label="bellTitle" :aria-pressed="hasActiveSubscription" :title="bellTitle"
          @click="handleBellClick" @contextmenu.prevent="openSubscriptionMenu">
          <el-icon>
            <Bell />
          </el-icon>
        </button>

        <section v-if="subscriptionMenuOpen" class="portal-subscription-menu" role="menu" aria-label="消息订阅设置"
          @contextmenu.prevent>
          <header class="portal-subscription-menu__head">
            <strong>消息订阅</strong>
          </header>
          <button class="portal-subscription-item" :class="{ active: officialActivitySubscriptionEnabled }"
            type="button" role="menuitemcheckbox" :aria-checked="officialActivitySubscriptionEnabled"
            :disabled="subscriptionBusy" @click="toggleSubscription('official_activity')">
            <span class="portal-subscription-item__copy">
              <strong>官方活动通知</strong>
              <small>平台公告、活动与福利提醒</small>
            </span>
            <span class="portal-subscription-item__state">{{
              officialActivitySubscriptionEnabled ? '开' : '关'
            }}</span>
          </button>
          <button class="portal-subscription-item" :class="{ active: devHallSubscriptionEnabled }" type="button"
            role="menuitemcheckbox" :aria-checked="devHallSubscriptionEnabled" :disabled="subscriptionBusy"
            @click="toggleSubscription('dev_hall_deposit_paid')">
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
      <template v-else>
        <div class="portal-user">
          <button class="portal-user__trigger" type="button" @click="menuOpen = !menuOpen">
            {{ auth.username || '已登录用户' }}
          </button>
          <div class="portal-user__menu" :class="{ open: menuOpen }">
            <button type="button" @click="goWorkbench">个人工作台</button>
            <button type="button" class="danger" @click="logout">退出登录</button>
          </div>
        </div>
      </template>
    </div>
  </header>
</template>

<style scoped>
.portal-header {
  --portal-nav-motion: cubic-bezier(0.22, 1, 0.36, 1);
  position: sticky;
  top: 10px;
  z-index: 40;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 20px;
  margin: 10px auto 14px;
  width: min(1280px, calc(100% - 24px));
  padding: 12px 16px;
  border-radius: 18px;
  border: 1px solid rgba(224, 232, 255, 0.96);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 12px 30px rgba(76, 103, 172, 0.08);
  backdrop-filter: blur(12px);
}

.portal-brand {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  color: inherit;
  text-decoration: none;
}

.portal-brand__mark {
  display: block;
  width: 38px;
  height: 38px;
  border-radius: 12px;
  object-fit: cover;
}

.portal-brand__copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.portal-brand__copy strong {
  display: block;
  font-size: 16px;
  line-height: 1.1;
  color: #0f172a;
}

.portal-brand__copy span {
  display: block;
  font-size: 11px;
  line-height: 1.2;
  letter-spacing: 0.04em;
  color: #64748b;
}

.portal-nav {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: flex-start;
  width: 100%;
  min-width: 0;
}

.portal-nav__link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 1 1 0;
  min-width: max-content;
  border: 0;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 700;
  text-align: center;
  color: #334155;
  text-decoration: none;
  background: transparent;
  transition:
    background-color 140ms ease,
    color 140ms ease,
    transform 160ms ease;
}

.portal-nav__link:hover,
.portal-nav__link.active {
  color: #1d4ed8;
  background: rgba(56, 107, 255, 0.08);
}

.portal-header__tools {
  display: inline-flex;
  align-items: center;
  justify-self: end;
  gap: 8px;
  min-width: 0;
}

.portal-search-menu {
  display: none;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  min-height: 42px;
  padding: 0 14px;
  border-radius: 14px;
  border: 1px solid rgba(191, 219, 254, 0.92);
  background: rgba(239, 246, 255, 0.94);
  color: #1d4ed8;
  font-size: 14px;
  font-weight: 800;
  line-height: 1;
  text-decoration: none;
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.08);
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    color 160ms ease,
    transform 160ms ease;
}

.portal-search-menu:hover,
.portal-search-menu:focus-visible {
  border-color: rgba(37, 99, 235, 0.34);
  background: rgba(219, 234, 254, 0.96);
  color: #1d4ed8;
  box-shadow: 0 10px 22px rgba(37, 99, 235, 0.12);
  transform: translateY(-1px);
}

.portal-subscription {
  position: relative;
  display: inline-grid;
  place-items: center;
}

.portal-search {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex: 0 1 auto;
  gap: 9px;
  width: clamp(260px, 28vw, 360px);
  min-width: 0;
  padding: 0 10px 0 12px;
  min-height: 42px;
  border-radius: 999px;
  border: 1px solid rgba(203, 213, 225, 0.86);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.94));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.82);
  color: #64748b;
  transition:
    width 300ms var(--portal-nav-motion),
    background-color 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    color 160ms ease,
    transform 220ms var(--portal-nav-motion);
}

.portal-search-scope {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  min-width: 64px;
  padding-right: 9px;
  border-right: 1px solid rgba(203, 213, 225, 0.82);
}

.portal-search-scope__trigger {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 58px;
  min-height: 32px;
  gap: 7px;
  padding: 0 17px 0 8px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #2563eb;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  line-height: 1;
  cursor: pointer;
  transition:
    background-color 160ms ease,
    color 160ms ease,
    transform 160ms ease;
}

.portal-search-scope__trigger::after {
  content: '';
  position: absolute;
  right: 6px;
  top: 50%;
  width: 0;
  height: 0;
  border-right: 4px solid transparent;
  border-left: 4px solid transparent;
  border-top: 5px solid currentColor;
  pointer-events: none;
  opacity: 0.56;
  transform: translateY(-25%);
  transition: transform 160ms ease;
}

.portal-search-scope__trigger[aria-expanded='true'] {
  background: rgba(219, 234, 254, 0.86);
  color: #1d4ed8;
}

.portal-search-scope__trigger[aria-expanded='true']::after {
  transform: translateY(-35%) rotate(180deg);
}

.portal-search-scope__trigger:hover,
.portal-search-scope__trigger:focus-visible {
  background: rgba(239, 246, 255, 0.96);
  color: #1d4ed8;
  outline: none;
}

.portal-search-scope__menu {
  position: absolute;
  top: calc(100% + 10px);
  left: 0;
  z-index: 90;
  display: grid;
  width: 112px;
  gap: 4px;
  padding: 6px;
  border: 1px solid rgba(191, 219, 254, 0.92);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 18px 38px rgba(37, 99, 235, 0.16), 0 4px 12px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(14px);
}

.portal-search-scope__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 34px;
  padding: 0 10px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #334155;
  font: inherit;
  font-size: 13px;
  font-weight: 750;
  text-align: left;
  cursor: pointer;
  transition:
    background-color 140ms ease,
    color 140ms ease,
    transform 140ms ease;
}

.portal-search-scope__option::after {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: transparent;
}

.portal-search-scope__option:hover,
.portal-search-scope__option:focus-visible {
  background: rgba(239, 246, 255, 0.96);
  color: #1d4ed8;
  outline: none;
}

.portal-search-scope__option.active {
  background: linear-gradient(135deg, #2563eb, #4f8cff);
  color: #fff;
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.18);
}

.portal-search-scope__option.active::after {
  background: currentColor;
}

.portal-search:hover,
.portal-search:focus-within {
  border-color: rgba(147, 197, 253, 0.96);
  background: #fff;
}

.portal-search.is-input-focused,
.portal-search.is-input-hovered,
.portal-search.is-filled {
  width: clamp(340px, 38vw, 540px);
  transform: translateX(-1px);
  border-color: rgba(147, 197, 253, 0.96);
  background: #fff;
}

.portal-search.is-filled {
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.82);
}

.portal-search-field {
  display: inline-flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  gap: 9px;
  align-self: stretch;
}

.portal-search-field>.el-icon {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  font-size: 18px;
  color: #64748b;
  transition: color 160ms ease;
}

.portal-search:hover .portal-search-field>.el-icon,
.portal-search:focus-within .portal-search-field>.el-icon,
.portal-search.is-input-focused .portal-search-field>.el-icon,
.portal-search.is-input-hovered .portal-search-field>.el-icon,
.portal-search.is-filled .portal-search-field>.el-icon {
  color: #2563eb;
}

.portal-search input {
  flex: 1;
  min-width: 0;
  height: 40px;
  padding-right: 30px;
  border: 0;
  outline: 0;
  appearance: none;
  background: transparent;
  caret-color: #2563eb;
  color: #0f172a;
  font: inherit;
  font-size: 14px;
  line-height: 1.4;
  text-overflow: ellipsis;
}

.portal-search input::placeholder {
  color: #94a3b8;
  font-weight: 500;
}

.portal-search input::-webkit-search-cancel-button,
.portal-search input::-webkit-search-decoration {
  appearance: none;
  display: none;
}

.portal-search-clear {
  position: absolute;
  top: 50%;
  right: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 999px;
  background: rgba(219, 234, 254, 0.74);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
  color: #2563eb;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-50%);
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    color 160ms ease,
    opacity 160ms ease,
    transform 160ms ease;
}

.portal-search-clear.is-visible {
  opacity: 1;
  pointer-events: auto;
}

.portal-search-clear:disabled {
  cursor: default;
}

.portal-search-clear:hover {
  background: rgba(191, 219, 254, 0.96);
}

.portal-search-clear:active {
  transform: translateY(-50%) scale(0.96);
}

.portal-search-clear:focus-visible {
  outline: 3px solid rgba(37, 99, 235, 0.16);
  outline-offset: 2px;
}

.portal-icon-btn,
.portal-text-btn,
.portal-solid-btn,
.portal-user__trigger {
  border: 0;
  font: inherit;
  cursor: pointer;
}

.portal-icon-btn {
  display: inline-grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  color: #334155;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid rgba(226, 232, 240, 0.96);
  transition: 160ms ease;
}

.portal-icon-btn--subscription:hover:not(:disabled) {
  color: #1d4ed8;
  border-color: rgba(37, 99, 235, 0.28);
  background: rgba(239, 246, 255, 0.96);
}

.portal-icon-btn--subscription.is-active,
.portal-icon-btn--subscription.is-active:hover:not(:disabled) {
  color: #fff;
  border-color: rgba(37, 99, 235, 0.5);
  background: linear-gradient(135deg, #2563eb, #4f8cff);
  box-shadow: 0 10px 22px rgba(37, 99, 235, 0.26);
}

.portal-icon-btn--subscription.is-loading {
  cursor: progress;
}

.portal-icon-btn:disabled {
  cursor: not-allowed;
}

.portal-subscription-menu {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  z-index: 70;
  display: grid;
  gap: 6px;
  width: 260px;
  padding: 10px;
  border-radius: 18px;
  border: 1px solid rgba(203, 213, 225, 0.92);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.14);
  backdrop-filter: blur(12px);
}

.portal-subscription-menu__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 6px 6px;
  color: #0f172a;
}

.portal-subscription-menu__head strong {
  font-size: 13px;
  line-height: 1.2;
}

.portal-subscription-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 10px 10px 10px 12px;
  border: 1px solid rgba(226, 232, 240, 0.94);
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.86);
  color: #0f172a;
  cursor: pointer;
  text-align: left;
  font: inherit;
  transition: 140ms ease;
}

.portal-subscription-item:hover:not(:disabled) {
  border-color: rgba(37, 99, 235, 0.22);
  background: rgba(239, 246, 255, 0.94);
}

.portal-subscription-item.active {
  border-color: rgba(37, 99, 235, 0.3);
  background: rgba(239, 246, 255, 0.96);
}

.portal-subscription-item:disabled {
  cursor: progress;
  opacity: 0.72;
}

.portal-subscription-item__copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.portal-subscription-item__copy strong {
  font-size: 13px;
  line-height: 1.2;
  color: #0f172a;
}

.portal-subscription-item__copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  line-height: 1.25;
  color: #64748b;
}

.portal-subscription-item__state {
  display: inline-grid;
  place-items: center;
  flex: 0 0 auto;
  min-width: 34px;
  height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.16);
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
}

.portal-subscription-item.active .portal-subscription-item__state {
  background: linear-gradient(135deg, #2563eb, #4f8cff);
  color: #fff;
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.22);
}

.portal-text-btn {
  padding: 9px 10px;
  border-radius: 10px;
  background: transparent;
  color: #0f172a;
  font-weight: 700;
  font-size: 13px;
  line-height: 1.2;
  transition:
    background-color 160ms ease,
    color 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}

.portal-text-btn:hover {
  color: #1d4ed8;
  background: rgba(239, 246, 255, 0.92);
  box-shadow: inset 0 0 0 1px rgba(147, 197, 253, 0.34);
  transform: translateY(-1px);
}

.portal-text-btn:active {
  transform: translateY(0);
}

.portal-solid-btn {
  padding: 9px 14px;
  border-radius: 10px;
  background: linear-gradient(135deg, #2563eb, #4f8cff);
  color: #fff;
  font-weight: 700;
  font-size: 13px;
  box-shadow: 0 10px 20px rgba(37, 99, 235, 0.22);
  line-height: 1.2;
  transition:
    background 180ms ease,
    box-shadow 180ms ease,
    filter 180ms ease,
    transform 160ms ease;
}

.portal-solid-btn:hover {
  background: linear-gradient(135deg, #1d4ed8, #3b82f6);
  box-shadow: 0 14px 26px rgba(37, 99, 235, 0.3);
  filter: saturate(1.06);
  transform: translateY(-1px);
}

.portal-solid-btn:active {
  box-shadow: 0 8px 16px rgba(37, 99, 235, 0.24);
  transform: translateY(0);
}

.portal-text-btn:focus-visible,
.portal-solid-btn:focus-visible {
  outline: 3px solid rgba(37, 99, 235, 0.16);
  outline-offset: 2px;
}

.portal-user {
  position: relative;
}

.portal-user__trigger {
  min-width: 124px;
  padding: 9px 12px;
  border-radius: 10px;
  background: rgba(239, 246, 255, 0.95);
  color: #1d4ed8;
  font-weight: 700;
  font-size: 13px;
}

.portal-user__menu {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  display: none;
  min-width: 190px;
  padding: 10px;
  border-radius: 18px;
  border: 1px solid rgba(203, 213, 225, 0.92);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.12);
}

.portal-user__menu.open {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.portal-user__menu button {
  border: 0;
  background: transparent;
  text-align: left;
  padding: 10px 12px;
  border-radius: 12px;
  cursor: pointer;
  color: #0f172a;
}

.portal-user__menu button:hover {
  background: rgba(241, 245, 249, 0.98);
}

.portal-user__menu .danger {
  color: #dc2626;
}

@media (max-width: 1180px) {
  .portal-header {
    grid-template-columns: auto minmax(0, 1fr);
    grid-template-areas:
      "brand nav"
      "tools tools";
    gap: 10px 14px;
    padding: 10px 14px;
  }

  .portal-brand {
    grid-area: brand;
  }

  .portal-nav {
    grid-area: nav;
    justify-content: space-between;
  }

  .portal-nav__link {
    padding: 9px 10px;
  }

  .portal-header__tools {
    grid-area: tools;
    justify-content: flex-end;
    width: 100%;
  }

  .portal-search {
    width: min(clamp(320px, 58vw, 620px), calc(100% - 176px));
  }

  .portal-search.is-input-focused,
  .portal-search.is-input-hovered,
  .portal-search.is-filled {
    width: min(clamp(420px, 70vw, 720px), calc(100% - 176px));
  }

  .portal-user__trigger {
    min-width: 112px;
  }
}

@media (max-width: 780px) {
  .portal-header {
    top: 0;
    width: calc(100% - 16px);
    margin: 8px auto 12px;
    border-radius: 16px;
    padding: 12px 16px;
  }

  .portal-search {
    flex: 1 1 100%;
    width: 100%;
  }

  .portal-search-scope {
    min-width: 58px;
    padding-right: 8px;
  }

  .portal-search-scope__trigger {
    min-width: 52px;
    padding-left: 6px;
    padding-right: 15px;
    font-size: 12px;
  }

  .portal-search-scope__menu {
    width: 104px;
  }

  .portal-search:hover,
  .portal-search:focus-within,
  .portal-search.is-input-focused,
  .portal-search.is-input-hovered,
  .portal-search.is-filled {
    width: 100%;
    transform: none;
  }

  .portal-header__tools,
  .portal-nav {
    width: 100%;
    flex-wrap: wrap;
  }
}

@media (max-width: 900px) {
  .portal-header.app-top-nav--home {
    top: 0;
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
    width: calc(100% - 16px);
    margin: 8px 8px 12px;
    height: auto;
    min-height: 66px;
    padding: 12px;
    border: 1px solid rgba(224, 232, 255, 0.96);
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.94);
    box-shadow: 0 10px 24px rgba(76, 103, 172, 0.08);
  }

  .portal-header.app-top-nav--home .portal-brand,
  .portal-header.app-top-nav--home .portal-nav,
  .portal-header.app-top-nav--home .portal-subscription,
  .portal-header.app-top-nav--home .portal-text-btn,
  .portal-header.app-top-nav--home .portal-solid-btn,
  .portal-header.app-top-nav--home .portal-user {
    display: none;
  }

  .portal-header.app-top-nav--home .portal-header__tools {
    width: 100%;
    min-width: 0;
    flex-wrap: nowrap;
    justify-content: stretch;
    gap: 8px;
  }

  .portal-header.app-top-nav--home .portal-search-menu {
    display: inline-flex;
  }

  .portal-header.app-top-nav--home .portal-search {
    flex: 1 1 0;
    width: auto;
    min-width: 0;
    min-height: 42px;
    background: rgba(248, 251, 255, 0.96);
  }

  .portal-header.app-top-nav--home .portal-search-scope {
    display: none;
  }
}

@media (max-width: 1180px) {
  .portal-header--dev {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    width: calc(100% - 16px);
    margin: 6px auto 8px;
    padding: 8px 10px;
    border-radius: 16px;
  }

  .portal-header--dev .portal-brand {
    min-width: 0;
  }

  .portal-header--dev .portal-brand__mark {
    width: 32px;
    height: 32px;
    border-radius: 10px;
    font-size: 13px;
  }

  .portal-header--dev .portal-brand__copy {
    min-width: 0;
  }

  .portal-header--dev .portal-brand__copy strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 14px;
  }

  .portal-header--dev .portal-brand__copy span {
    display: none;
  }

  .portal-header--dev .portal-header__tools {
    width: auto;
    min-width: 0;
    justify-content: flex-end;
    flex-wrap: nowrap;
  }

  .portal-header--dev .portal-icon-btn {
    width: 32px;
    height: 32px;
  }

  .portal-header--dev .portal-user__trigger {
    min-width: 0;
    max-width: 112px;
    padding: 7px 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
  }
}
</style>
