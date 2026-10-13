<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, type ComponentPublicInstance } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { HttpError, apiUrl } from '@/api/http'
import {
  invalidateResourceListCache,
  likePublicMcResource,
  listPublicMcResources,
  unlikePublicMcResource,
  type McResourcePlatform,
  type PublicMcResourceItem,
} from '@/api/resources'
import {
  getTagFilterSections,
  getTagRouteSlug,
  normalizeTagName,
  type McTagFilterSection,
} from '@/api/resourceTags'
import { useMultiSelectTags } from '@/composables/useMultiSelectTags'
import { useTagTreeStore } from '@/stores/tagTree'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import { resourceDetailLocation, resourceListingSaleOf } from '@/shared/resourceNavigation'
import {
  DEFAULT_RESOURCE_LISTING_SALE,
  formatResourcePriceLabel,
  isCashPaidListingResource,
  isFreeListingResource,
  isPointsResource,
  isPricedResource,
  type ResourceListingSale,
} from '@/shared/resourceSale'

type McCardItem = {
  id: number
  title: string
  ownerName: string
  author: string
  authorUsernameGradient: boolean
  authorUsernameColor: string
  /** 与作者不是同一人时才有值 */
  developer: string
  developerUsernameGradient: boolean
  developerUsernameColor: string
  description: string
  groupTags: Record<string, string[]>
  tags: string[]
  updatedAt: string
  sourceUrl: string
  coverUrl: string | null
  coverFailed: boolean
  likeCount: number
  likedByMe: boolean
  likeSubmitting: boolean
  originType: 'original' | 'repost'
  originAuthor: string | null
  originOrg: string | null
  originUrl: string | null
  priceFen: number
  pricePoints: number
  priceLabel: string
}

type FilterSectionView = McTagFilterSection & {
  selected: string[]
}

type CatalogPageState = {
  current: number
  total: number
  hasPrev: boolean
  hasNext: boolean
  totalItems: number
}

const props = defineProps<{
  platform: McResourcePlatform
  rootSlug: string
  entrySlug: string
  groupName: string
  /** 免费 / 付费分区：由页内分段切换写入（见 ResourceCatalogView），这里只做展示过滤 */
  listingMode?: ResourceListingSale | null
  /**
   * 资源列表页（桌面端）：卡片不跳独立详情路由，而是把选中项交给父级，
   * 由父级把整个列表换出、就地在同一块内容区渲染详情（见 ResourceCatalogView / ResourceDetailPanel）。
   */
  masterDetail?: boolean
}>()

/** 已选筛选汇总出来的一枚 chip：父页面据此渲染可逐个移除的筛选条 */
type ActiveFilterChip = {
  key: string
  sectionId: number
  label: string
  tag: string
}

const emit = defineEmits<{
  (e: 'page-state-change', state: CatalogPageState): void
  /** 两个分区的资源计数（本地算，不额外请求），供工具条上的分段控件带计数 */
  (e: 'listing-counts', counts: { free: number; paid: number }): void
  /** 已选筛选的汇总，供父页面渲染 chip 条 */
  (e: 'filters-change', chips: ActiveFilterChip[]): void
  /** 空态里「切换分区」出口，交给父页面写回路由 `?sale=` */
  (e: 'switch-listing-mode', value: ResourceListingSale): void
  /** 主从双栏下选中某条资源：父页面据此更新右栏与地址栏（`?resource=<id>`） */
  (e: 'select-resource', id: number): void
}>()

const sortOptions = ['最新', '点赞']
const { showToast } = useToast()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const tagTreeStore = useTagTreeStore()

const filterSections = ref<FilterSectionView[]>([])
const expandedSectionIds = ref<number[]>([])
const pageSize = 12
const currentPage = ref(1)

const selectedSort = ref('最新')
const activeListingMode = computed<ResourceListingSale>(
  () => props.listingMode ?? DEFAULT_RESOURCE_LISTING_SALE,
)

const { onTagPointerDown, onTagPointerEnter, onTagPointerUp, onTagPointerCancel, onTagClick } =
  useMultiSelectTags()

const cards = ref<McCardItem[]>([])

const groupLabel = computed(() => normalizeTagName(props.groupName || '当前分区'))
const fallbackIconClass = computed(() => 'bg-blue')
const fallbackIcon = computed(() => '📁')

function isSectionExpanded(sectionId: number) {
  return expandedSectionIds.value.includes(sectionId)
}

function onCoverError(card: McCardItem) {
  card.coverFailed = true
}

function toggleSection(sectionId: number) {
  if (isSectionExpanded(sectionId)) {
    expandedSectionIds.value = expandedSectionIds.value.filter((id) => id !== sectionId)
    return
  }

  expandedSectionIds.value = [...expandedSectionIds.value, sectionId]
}

function normalizeQueryValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean)
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return []
}

function applyFiltersFromQuery() {
  filterSections.value.forEach((section) => {
    section.selected = normalizeQueryValues(route.query[section.queryKey])
  })
}

function mapResourceToCard(item: PublicMcResourceItem): McCardItem {
  const tags = Array.from(new Set(item.tag_selections.flatMap((entry) => entry.tag_names)))
  const groupTags = Object.fromEntries(
    item.tag_selections.map((entry) => [
      normalizeTagName(entry.group_name),
      entry.tag_names.map((tag) => normalizeTagName(tag)).filter(Boolean),
    ]),
  )

  const priceFen = item.price_fen ?? 0
  const pricePoints = item.price_points ?? 0
  const creator = item.creator.trim()
  return {
    id: item.id,
    title: item.title,
    ownerName: item.creator.trim() || item.author.trim() || item.title,
    author: item.author,
    authorUsernameGradient: !!item.author_username_gradient,
    authorUsernameColor: item.author_username_color || '',
    developer: creator && creator !== item.author.trim() ? creator : '',
    developerUsernameGradient: !!item.creator_username_gradient,
    developerUsernameColor: item.creator_username_color || '',
    description: item.description,
    groupTags,
    tags: tags.length > 0 ? tags : ['未标注'],
    updatedAt: item.updated_at,
    sourceUrl: item.source_url,
    coverUrl: item.cover_url ? apiUrl(item.cover_url) : null,
    coverFailed: false,
    likeCount: item.like_count ?? 0,
    likedByMe: item.liked_by_me ?? false,
    likeSubmitting: false,
    originType: item.origin_type,
    originAuthor: item.origin_author ?? null,
    originOrg: item.origin_org ?? null,
    originUrl: item.origin_url ?? null,
    priceFen,
    pricePoints,
    priceLabel: formatResourcePriceLabel(priceFen, pricePoints),
  }
}

function toggleFilter(list: string[], item: string) {
  const index = list.indexOf(item)
  if (index >= 0) {
    list.splice(index, 1)
  } else {
    list.push(item)
  }
}

/**
 * 免费 / 付费两个分区的计数：只遍历本地已加载的 cards，不发请求。
 * 与 `filteredCards` 用同一对判定函数，保证「计数」与「点进去看到的条数」一致。
 */
const listingCounts = computed(() => {
  let free = 0
  let paid = 0
  for (const card of cards.value) {
    if (isCashPaidListingResource(card.priceFen, card.pricePoints)) {
      paid += 1
    } else if (isFreeListingResource(card.priceFen, card.pricePoints)) {
      free += 1
    }
  }
  return { free, paid }
})

/** 已选筛选的汇总（扁平化），工具条按它渲染可移除 chip */
const activeFilterChips = computed<ActiveFilterChip[]>(() =>
  filterSections.value.flatMap((section) =>
    section.selected.map((tag) => ({
      key: `${section.id}:${tag}`,
      sectionId: section.id,
      label: section.label,
      tag,
    })),
  ),
)

const hasActiveFilters = computed(() => activeFilterChips.value.length > 0)

const activeListingLabel = computed(() => (activeListingMode.value === 'paid' ? '付费资源' : '免费资源'))

/** 空态「换分区」出口的目标：就是另一侧 */
const otherListingMode = computed<ResourceListingSale>(() =>
  activeListingMode.value === 'free' ? 'paid' : 'free',
)

const otherListingLabel = computed(() => (otherListingMode.value === 'paid' ? '付费资源' : '免费资源'))

/** 移除一枚筛选并回到第一页 */
function removeFilter(sectionId: number, tag: string) {
  const section = filterSections.value.find((item) => item.id === sectionId)
  if (!section) {
    return
  }

  section.selected = section.selected.filter((item) => item !== tag)
  goToPage(1)
}

/** 清空某一组筛选 */
function clearSection(section: FilterSectionView) {
  section.selected = []
  goToPage(1)
}

/** 清空全部筛选（空态主按钮 / 工具条「清除全部」共用） */
function clearFilters() {
  filterSections.value.forEach((section) => {
    section.selected = []
  })
  goToPage(1)
}

/** 空态出口：去首页发布需求（沿用门户既有 `?modal=publish` 口径） */
function goPublishRequirement() {
  void router.push({ name: 'home', query: { modal: 'publish' } })
}

const filteredCards = computed(() => {
  const filtered = cards.value.filter((card) => {
    if (activeListingMode.value === 'free') {
      if (!isFreeListingResource(card.priceFen, card.pricePoints)) {
        return false
      }
    } else if (!isCashPaidListingResource(card.priceFen, card.pricePoints)) {
      return false
    }

    for (const section of filterSections.value) {
      if (section.selected.length === 0) {
        continue
      }

      const groupValues = card.groupTags[section.label] ?? []
      const matched = section.selected.some((tag) => groupValues.includes(tag))
      if (!matched) {
        return false
      }
    }

    return true
  })

  if (selectedSort.value === '点赞') {
    return filtered
      .slice()
      .sort(
        (a, b) => b.likeCount - a.likeCount || Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
      )
  }
  return filtered.slice().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
})

const totalPages = computed(() => {
  return Math.max(1, Math.ceil(filteredCards.value.length / pageSize))
})

const pagedCards = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return filteredCards.value.slice(start, start + pageSize)
})

function emitPageState() {
  emit('page-state-change', {
    current: currentPage.value,
    total: totalPages.value,
    hasPrev: currentPage.value > 1,
    hasNext: currentPage.value < totalPages.value,
    totalItems: filteredCards.value.length,
  })
}

function goToPage(page: number) {
  const target = Math.min(Math.max(page, 1), totalPages.value)
  currentPage.value = target
}

function nextPage() {
  goToPage(currentPage.value + 1)
}

function prevPage() {
  goToPage(currentPage.value - 1)
}

function setSort(sort: string) {
  if (sortOptions.includes(sort)) {
    selectedSort.value = sort
    goToPage(1)
  }
}

defineExpose({
  setSort,
  nextPage,
  prevPage,
  goToPage,
  removeFilter,
  clearFilters,
})

/** 全角字符（中日韩文字与全角符号）：按 1 个字号宽度估算 */
const FULL_WIDTH_CHAR_PATTERN =
  /[\u2e80-\u303f\u3040-\u33ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/

/** 标题显示宽度估算（单位 em）：全角按 1，半角（英文 / 数字）按 0.55。 */
function titleEmWidth(title: string): number {
  let width = 0
  for (const char of title.trim()) {
    width += FULL_WIDTH_CHAR_PATTERN.test(char) ? 1 : 0.55
  }
  return width
}

/**
 * 标题字号档位：字少用大字号单行展示（占满标题行预留的两行高度），
 * 字多则缩小字号并压到最多两行，超出部分省略。
 */
function titleSizeClass(title: string): string {
  return titleEmWidth(title) > 12 ? 'is-long' : ''
}

function formatUpdatedAt(value: string): string[] {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ['最近更新']
  }

  return [
    date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }),
    date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
  ]
}

function openResource(card: McCardItem) {
  // 主从双栏（资源列表页桌面端）：不跳独立详情路由，交给父级在右栏就地展开
  // （选中态写进 URL 的 `?resource=` 由父级统一负责）。
  if (props.masterDetail) {
    emit('select-resource', card.id)
    return
  }

  // 本组件当独立列表页用时：同样落到页内详情态（独立详情页已废弃）
  void router.push(
    resourceDetailLocation({
      resourceId: card.id,
      rootSlug: props.rootSlug,
      entrySlug: props.entrySlug || getTagRouteSlug(props.groupName),
      sale: resourceListingSaleOf(card.priceFen, card.pricePoints),
    }),
  )
}

function openLikeLogin() {
  showToast('请先登录后再点赞', 'info')
  void router.push({
    name: 'home',
    query: {
      modal: 'auth',
      mode: 'login',
      redirect_to: route.fullPath,
    },
  })
}

async function toggleCardLike(card: McCardItem) {
  if (card.likeSubmitting) {
    return
  }

  if (!auth.isAuthed || !auth.token.trim()) {
    openLikeLogin()
    return
  }

  card.likeSubmitting = true
  try {
    const state = card.likedByMe
      ? await unlikePublicMcResource(auth.token, card.id)
      : await likePublicMcResource(auth.token, card.id)
    card.likedByMe = state.liked_by_me
    card.likeCount = state.like_count
    invalidateResourceListCache()
    showToast(state.liked_by_me ? '已点赞' : '已取消点赞', 'success')
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      auth.logout()
      openLikeLogin()
    } else {
      showToast(error instanceof Error ? error.message : '点赞操作失败', 'error')
    }
  } finally {
    card.likeSubmitting = false
  }
}

async function loadTagTree() {
  try {
    const token = auth.token?.trim() ? auth.token : null
    const tree = await tagTreeStore.ensure()
    const resources = await listPublicMcResources(props.platform, token)
    cards.value = resources.map(mapResourceToCard)
    filterSections.value = getTagFilterSections(tree, props.rootSlug, props.entrySlug).map(
      (section) => ({
        ...section,
        selected: [],
      }),
    )
    applyFiltersFromQuery()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '加载标签失败', 'warning')
  }
}

const MARQUEE_PX_PER_SECOND = 30

function measureAuthorMarquee(viewport: HTMLElement) {
  const track = viewport.firstElementChild as HTMLElement | null
  const overflow = track ? Math.ceil(track.scrollWidth - viewport.clientWidth) : 0
  const scrolling = overflow > 1
  viewport.classList.toggle('is-overflowing', scrolling)
  viewport.style.setProperty('--marquee-shift', scrolling ? `-${overflow}px` : '0px')
  viewport.style.setProperty('--marquee-duration', `${Math.max(3, overflow / MARQUEE_PX_PER_SECOND + 2)}s`)
}

const authorMarqueeObserver =
  typeof ResizeObserver === 'undefined'
    ? null
    : new ResizeObserver((entries) => {
        for (const entry of entries) {
          const target = entry.target as HTMLElement
          const viewport = target.classList.contains('portal-resource-browser__author-pill-viewport')
            ? target
            : target.parentElement
          if (viewport) {
            measureAuthorMarquee(viewport)
          }
        }
      })

function observeAuthorMarquee(el: Element | ComponentPublicInstance | null) {
  if (!(el instanceof HTMLElement)) {
    return
  }
  measureAuthorMarquee(el)
  if (authorMarqueeObserver) {
    authorMarqueeObserver.observe(el)
    if (el.firstElementChild) {
      authorMarqueeObserver.observe(el.firstElementChild)
    }
  }
}

onMounted(() => {
  auth.hydrate()
  void loadTagTree()
})

onBeforeUnmount(() => {
  authorMarqueeObserver?.disconnect()
})

watch(
  () => [props.platform, props.entrySlug, props.groupName],
  () => {
    void loadTagTree()
  },
)

watch(
  () => route.query,
  (next, prev) => {
    // `?sale=` 是免费 / 付费页内切换写的，`?resource=` 是主从双栏选中项写的，
    // 两者都与标签筛选无关：只改它们时不要重新套用 query 里的筛选，否则已选标签会被清掉。
    const changedKeys = new Set([...Object.keys(next ?? {}), ...Object.keys(prev ?? {})])
    changedKeys.delete('sale')
    changedKeys.delete('resource')
    if (changedKeys.size === 0) {
      return
    }

    applyFiltersFromQuery()
  },
)

watch(activeListingMode, () => {
  // 换分区等于换一批数据，回到第一页
  goToPage(1)
})

watch(
  () => auth.token,
  () => {
    void loadTagTree()
  },
)

watch(
  () => filteredCards.value.length,
  () => {
    if (currentPage.value > totalPages.value) {
      currentPage.value = totalPages.value
    }
    emitPageState()
  },
  { immediate: true },
)

watch(
  () => currentPage.value,
  () => {
    emitPageState()
  },
)

// 计数与已选筛选汇总上报给父页面（工具条上的分段计数与 chip 条）：
// 数据全在本地，切换分区只重算这两个 computed，不发请求。
watch(listingCounts, (counts) => emit('listing-counts', counts), { immediate: true })

watch(activeFilterChips, (chips) => emit('filters-change', chips), { immediate: true })
</script>

<template>
  <section class="portal-resource-browser">
    <section class="portal-resource-browser__filters">
      <nav class="portal-resource-browser__menu" aria-label="标签筛选菜单">
        <section v-for="section in filterSections" :key="section.id" class="portal-resource-browser__menu-group" :class="{
          'portal-resource-browser__menu-group--open': isSectionExpanded(section.id),
          'portal-resource-browser__menu-group--active': section.selected.length > 0,
        }">
          <div class="portal-resource-browser__menu-head">
            <button class="portal-resource-browser__menu-trigger" type="button" @click="toggleSection(section.id)"
              :aria-expanded="isSectionExpanded(section.id)" :class="{
              'portal-resource-browser__menu-trigger--active': section.selected.length > 0,
            }">
              <span class="portal-resource-browser__menu-title">{{ section.label }}</span>
              <span v-if="section.selected.length > 0" class="portal-resource-browser__menu-badge">
                {{ section.selected.length }}
              </span>
            </button>
            <button v-if="section.selected.length > 0" class="portal-resource-browser__menu-clear" type="button"
              :aria-label="`清空「${section.label}」筛选`" @click="clearSection(section)">
              清空
            </button>
          </div>

          <div v-show="isSectionExpanded(section.id)" class="portal-resource-browser__submenu">
            <button v-for="tag in section.tags" :key="tag" class="portal-resource-browser__submenu-link" :class="{
              'portal-resource-browser__submenu-link--active': section.selected.includes(tag),
            }" @pointerdown="onTagPointerDown(section.selected, tag, $event)"
              @pointerenter="onTagPointerEnter(section.selected, tag)" @pointerup="onTagPointerUp"
              @pointercancel="onTagPointerCancel" @click="onTagClick(section.selected, tag, toggleFilter)">
              {{ tag }}
            </button>
          </div>
        </section>
      </nav>
    </section>

    <section class="portal-resource-browser__grid">
      <article v-for="card in pagedCards" :key="card.id" class="portal-resource-browser__card">
        <div class="portal-resource-browser__card-main">
          <div v-if="card.coverUrl && !card.coverFailed" class="portal-resource-browser__cover portal-resource-browser__cover--image">
            <img :src="card.coverUrl" :alt="card.title" class="portal-resource-browser__cover-image" @error="onCoverError(card)" />
          </div>
          <div v-else class="portal-resource-browser__cover" :class="fallbackIconClass">
            {{ fallbackIcon }}
          </div>

          <div class="portal-resource-browser__body">
            <div class="portal-resource-browser__headline">
              <div class="portal-resource-browser__headline-main">
                <div class="portal-resource-browser__title-row">
                  <div class="portal-resource-browser__title-main">
                    <h3 :class="titleSizeClass(card.title)">{{ card.title }}</h3>
                    <p class="portal-resource-browser__author-pill">
                      <span class="portal-resource-browser__author-pill-label">作者</span>
                      <span :ref="observeAuthorMarquee" class="portal-resource-browser__author-pill-viewport">
                        <span class="portal-resource-browser__author-pill-track">
                          <span
                            :class="{ 'username-gradient': card.authorUsernameGradient && !card.authorUsernameColor }"
                            :style="card.authorUsernameColor ? { color: card.authorUsernameColor } : {}">{{ card.author || '未知' }}</span>
                          <template v-if="card.developer">
                            <span class="portal-resource-browser__author-pill-label">开发者</span>
                            <span
                              :class="{ 'username-gradient': card.developerUsernameGradient && !card.developerUsernameColor }"
                              :style="card.developerUsernameColor ? { color: card.developerUsernameColor } : {}">{{ card.developer }}</span>
                          </template>
                        </span>
                      </span>
                    </p>
                  </div>
                  <span class="portal-resource-browser__updated">
                    <span v-for="part in formatUpdatedAt(card.updatedAt)" :key="part">{{ part }}</span>
                  </span>
                </div>
                <div class="portal-resource-browser__author-line">
                  <span
                    class="portal-resource-browser__price-badge"
                    :class="{
                      'is-paid': isPricedResource(card.priceFen, card.pricePoints),
                      'is-points': isPointsResource(card.pricePoints),
                    }"
                  >{{ card.priceLabel }}</span>
                  <span class="portal-resource-browser__meta"
                    :class="{ 'is-repost': card.originType === 'repost' }">{{ card.originType === 'repost' ? '转载' : '原创' }}</span>
                </div>
              </div>
            </div>

          </div>
        </div>

        <p class="portal-resource-browser__desc">{{ card.description }}</p>

        <div class="portal-resource-browser__footer">
          <div class="portal-resource-browser__tags">
            <span v-for="tag in card.tags" :key="`${card.id}-${tag}`">{{ tag }}</span>
          </div>
          <div class="portal-resource-browser__actions">
            <button class="portal-resource-browser__like" type="button"
              :class="{ 'portal-resource-browser__like--active': card.likedByMe }" :disabled="card.likeSubmitting"
              :aria-pressed="card.likedByMe" @click="toggleCardLike(card)">
              <span aria-hidden="true">{{ card.likedByMe ? '♥' : '♡' }}</span>
              <span>{{ card.likeCount }}</span>
            </button>
            <button class="portal-resource-browser__action" type="button" @click="openResource(card)">
              查看详情
            </button>
          </div>
        </div>
      </article>

      <div v-if="filteredCards.length === 0" class="portal-resource-browser__empty">
        <strong>{{ hasActiveFilters ? '当前筛选下还没有公开资源' : `还没有${activeListingLabel}` }}</strong>
        <span>
          {{ hasActiveFilters
            ? '可以逐个去掉左侧的筛选，或换个分区看看。'
            : `${activeListingLabel}这一分区暂时还没有公开内容，可以换个分区，或自己发布一条需求。` }}
        </span>
        <div class="portal-resource-browser__empty-actions">
          <button v-if="hasActiveFilters" class="portal-resource-browser__empty-btn portal-resource-browser__empty-btn--primary"
            type="button" @click="clearFilters">
            清除全部筛选
          </button>
          <button class="portal-resource-browser__empty-btn" type="button"
            @click="emit('switch-listing-mode', otherListingMode)">
            看看{{ otherListingLabel }}
          </button>
          <button class="portal-resource-browser__empty-btn portal-resource-browser__empty-btn--ghost" type="button"
            @click="goPublishRequirement">
            发布需求
          </button>
        </div>
      </div>
    </section>
  </section>
</template>

<style scoped>
.portal-resource-browser {
  display: grid;
  grid-template-columns: minmax(200px, 240px) minmax(0, 1fr);
  align-items: start;
  gap: 16px;
}

/* 层级靠描边与底色，不用投影（本轮重设计口径：卡片去阴影改描边） */
.portal-resource-browser__filters,
.portal-resource-browser__card,
.portal-resource-browser__empty {
  border: 1px solid var(--card-border);
  background: var(--bg-soft);
}

.portal-resource-browser__filters {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border-radius: 12px;
  position: sticky;
  top: 86px;
}

/* 售价与「原创 / 转载」一律降为小号中性 chip（重设计口径：卡片内标签不与标题抢重量） */
.portal-resource-browser__price-badge {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #475569;
  background: rgba(241, 245, 249, 0.96);
}

.portal-resource-browser__price-badge.is-paid {
  color: #334155;
  background: rgba(226, 232, 240, 0.96);
}

.portal-resource-browser__menu {
  display: grid;
  gap: 6px;
}

.portal-resource-browser__menu-group {
  display: grid;
  gap: 6px;
}

.portal-resource-browser__menu-head {
  display: flex;
  align-items: center;
  gap: 4px;
}

.portal-resource-browser__menu-badge {
  flex: 0 0 auto;
  display: inline-grid;
  place-items: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--accent);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

/* 单组「全清」：只在有选中时出现，避免占掉组标题的位置 */
.portal-resource-browser__menu-clear {
  flex: 0 0 auto;
  height: 24px;
  padding: 0 8px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #64748b;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition:
    background 160ms ease,
    color 160ms ease;
}

.portal-resource-browser__menu-clear:hover {
  background: rgba(31, 74, 209, 0.08);
  color: var(--accent);
}

.portal-resource-browser__menu-trigger {
  position: sticky;
  top: 86px;
  z-index: 2;
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 8px 10px;
  border-radius: 10px;
  /* 常驻 1px 透明描边：选中 / 悬停只换描边色，不用阴影也不用内描边环 */
  border: 1px solid transparent;
  background: transparent;
  color: #334155;
  cursor: pointer;
  text-align: left;
  transition:
    background 180ms ease,
    border-color 180ms ease,
    color 180ms ease,
    transform 180ms ease;
}

/* 折叠指示箭头：折叠朝下、展开朝上。
   原来这四个分组只是一行粗体字，没有任何"可点开"的提示 */
.portal-resource-browser__menu-trigger::after {
  content: '';
  justify-self: end;
  width: 7px;
  height: 7px;
  margin-right: 3px;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  border-radius: 1px;
  opacity: 0.45;
  transform: rotate(45deg) translate(-1px, -1px);
  transition:
    transform 180ms ease,
    opacity 180ms ease;
}

.portal-resource-browser__menu-group--open>.portal-resource-browser__menu-trigger::after {
  opacity: 0.9;
  transform: rotate(-135deg) translate(-1px, -1px);
}

.portal-resource-browser__menu-trigger::before {
  content: '';
  position: absolute;
  left: 0;
  top: 9px;
  bottom: 9px;
  width: 3px;
  border-radius: 999px;
  background: #2563eb;
  opacity: 0;
  transform: scaleY(0.45);
  transform-origin: center;
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.portal-resource-browser__menu-trigger:hover,
.portal-resource-browser__menu-trigger--active,
.portal-resource-browser__menu-group--open>.portal-resource-browser__menu-trigger {
  background: rgba(239, 246, 255, 0.96);
  color: #1d4ed8;
  border-color: rgba(191, 219, 254, 0.52);
}

.portal-resource-browser__menu-trigger:hover {
  transform: translateX(2px);
}

.portal-resource-browser__menu-trigger--active::before,
.portal-resource-browser__menu-group--open>.portal-resource-browser__menu-trigger::before {
  opacity: 1;
  transform: scaleY(1);
}

.portal-resource-browser__menu-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 800;
  color: #334155;
}

.portal-resource-browser__submenu {
  display: grid;
  gap: 6px;
  margin-left: 12px;
  padding-left: 12px;
  border-left: 1px solid rgba(209, 220, 243, 0.95);
}

.portal-resource-browser__submenu-link {
  width: 100%;
  min-height: 34px;
  border: 0;
  border-radius: 10px;
  padding: 7px 10px;
  background: transparent;
  color: #334155;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  text-align: left;
  cursor: pointer;
  transition:
    background 180ms ease,
    color 180ms ease,
    transform 180ms ease;
}

.portal-resource-browser__submenu-link:hover {
  transform: translateX(2px);
}

.portal-resource-browser__submenu-link:hover,
.portal-resource-browser__submenu-link--active {
  background: rgba(248, 251, 255, 0.96);
  color: #1d4ed8;
}

/* 已无引用的旧规则（原来的 `__row` / `__group` / `__label` / `__tag` / `__reset`
   与「↻ 重置筛选」一起下线）已删除：重置入口改由工具条上的已选筛选 chip 承担。 */
.portal-resource-browser__author-pill,
.portal-resource-browser__updated,
.portal-resource-browser__meta {
  color: #64748b;
}

.portal-resource-browser__action,
.portal-resource-browser__like {
  border: 0;
  font: inherit;
  cursor: pointer;
}

.portal-resource-browser__grid {
  display: grid;
  /* 结果区：2–3 列自适应；窄屏在 980px 处回落单列 */
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  align-items: stretch;
  gap: 14px;
}

.portal-resource-browser__card {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border-radius: 12px;
  transition: border-color 180ms ease;
}

/* 悬停只变描边色：不做位移、不加投影 */
.portal-resource-browser__card:hover {
  border-color: rgba(31, 74, 209, 0.4);
}

.portal-resource-browser__card-main {
  min-width: 0;
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.portal-resource-browser__cover {
  width: 72px;
  height: 72px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 18px;
  font-size: 34px;
  color: #fff;
}

.portal-resource-browser__cover--image {
  overflow: hidden;
  background: rgba(226, 232, 240, 0.72);
}

.portal-resource-browser__cover-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.portal-resource-browser__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.portal-resource-browser__headline {
  align-items: flex-start;
}

.portal-resource-browser__footer {
  position: relative;
  display: flex;
  min-width: 0;
  width: 100%;
  max-width: 100%;
  margin-top: auto;
}

.portal-resource-browser__actions {
  position: absolute;
  right: 0;
  bottom: 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.portal-resource-browser__headline h3 {
  margin: 0;
  color: #0f172a;
}

.portal-resource-browser__headline-main {
  flex: 1;
  min-width: 0;
}

.portal-resource-browser__title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  /* 标题行固定预留两行高度：短标题单行居中，长标题最多两行，卡片高度不随标题长短跳动 */
  min-height: 44px;
}

.portal-resource-browser__title-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
}

.portal-resource-browser__title-row h3 {
  min-width: 0;
  font-size: 15px;
  line-height: 1.3;
}

/* 长标题：缩小字号，压到最多两行，超出省略 */
.portal-resource-browser__title-row h3.is-long {
  display: -webkit-box;
  overflow: hidden;
  overflow-wrap: anywhere;
  word-break: break-word;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  font-size: 13px;
  line-height: 1.35;
}

.portal-resource-browser__title-row .portal-resource-browser__updated {
  flex-shrink: 0;
  display: inline-flex;
  flex-direction: column;
  align-items: flex-end;
  line-height: 1.35;
  text-align: right;
}

.portal-resource-browser__author-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  padding: 6px 12px;
  background: rgba(219, 234, 254, 0.92);
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 700;
  line-height: normal;
  max-width: 100%;
}

.portal-resource-browser__author-pill-label {
  flex-shrink: 0;
  white-space: nowrap;
}

.portal-resource-browser__author-pill-viewport {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}

.portal-resource-browser__author-pill-track {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* 名字放不下时左右往返滚动，--marquee-shift 由脚本按溢出宽度写入 */
.portal-resource-browser__author-pill-viewport.is-overflowing .portal-resource-browser__author-pill-track {
  animation: portal-author-marquee var(--marquee-duration, 6s) ease-in-out infinite alternate;
}

.portal-resource-browser__author-pill-viewport.is-overflowing:hover .portal-resource-browser__author-pill-track {
  animation-play-state: paused;
}

@keyframes portal-author-marquee {
  0%,
  15% {
    transform: translateX(0);
  }
  85%,
  100% {
    transform: translateX(var(--marquee-shift, 0px));
  }
}

@media (prefers-reduced-motion: reduce) {
  .portal-resource-browser__author-pill-viewport.is-overflowing .portal-resource-browser__author-pill-track {
    animation: none;
  }
}

.portal-resource-browser__author-line {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}


.portal-resource-browser__desc,
.portal-resource-browser__updated,
.portal-resource-browser__meta,
.portal-resource-browser__empty {
  line-height: 1.7;
}

.portal-resource-browser__author-pill,
.portal-resource-browser__updated {
  margin: 4px 0 0;
  font-size: 12px;
}

.portal-resource-browser__desc {
  margin: 0;
  color: #475569;
}

.portal-resource-browser__tags {
  display: flex;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: 10px;
  min-width: 0;
  align-self: stretch;
  width: 100%;
  max-width: 100%;
}

.portal-resource-browser__tags::after {
  content: '';
  flex: 0 0 170px;
  height: 43px;
  visibility: hidden;
}

/* 与首页精选卡 portal-spotlight-card__meta-row、资源详情页标签同款胶囊 */
.portal-resource-browser__tags > span {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  max-width: 100%;
  min-height: 22px;
  padding: 2px 9px;
  border-radius: 999px;
  background: rgba(241, 245, 249, 0.96);
  color: #475569;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 「原创/转载」也走中性 chip，不再用靛蓝 / 琥珀两套色（与售价 chip 同一档） */
.portal-resource-browser__meta {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 1px 8px;
  border-radius: 999px;
  background: rgba(241, 245, 249, 0.96);
  color: #475569;
  font-size: 12px;
  font-weight: 700;
}

.portal-resource-browser__meta.is-repost {
  background: rgba(241, 245, 249, 0.96);
  color: #475569;
}

.portal-resource-browser__action {
  padding: 10px 16px;
  border-radius: 12px;
  background: rgba(239, 246, 255, 0.9);
  color: #1d4ed8;
  font-weight: 700;
}

.portal-resource-browser__like {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 66px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(248, 250, 252, 0.96);
  color: #64748b;
  font-weight: 800;
}

.portal-resource-browser__like--active {
  background: rgba(254, 226, 226, 0.94);
  color: #dc2626;
}

.portal-resource-browser__like:disabled {
  cursor: wait;
  opacity: 0.7;
}

.portal-resource-browser__empty {
  display: grid;
  justify-items: center;
  gap: 8px;
  grid-column: 1 / -1;
  padding: 56px 24px;
  border-radius: 12px;
  text-align: center;
  color: #64748b;
}

.portal-resource-browser__empty strong {
  color: #0f172a;
  font-size: 16px;
}

.portal-resource-browser__empty span {
  max-width: 520px;
  font-size: 13px;
  line-height: 1.7;
}

/* 空态的三条出口：主按钮（清筛选）+ 次按钮（换分区）+ 幽灵按钮（发布需求） */
.portal-resource-browser__empty-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-top: 8px;
}

.portal-resource-browser__empty-btn {
  height: 34px;
  padding: 0 16px;
  border: 1px solid var(--card-border);
  border-radius: 10px;
  background: var(--bg-soft);
  color: #334155;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    color 160ms ease,
    background 160ms ease;
}

.portal-resource-browser__empty-btn:hover {
  border-color: rgba(31, 74, 209, 0.4);
  color: var(--accent);
}

.portal-resource-browser__empty-btn--primary {
  border-color: transparent;
  background: var(--accent);
  color: #fff;
}

.portal-resource-browser__empty-btn--primary:hover {
  color: #fff;
}

.portal-resource-browser__empty-btn--ghost {
  border-color: transparent;
  background: transparent;
}

@media (max-width: 980px) {
  .portal-resource-browser {
    grid-template-columns: 1fr;
  }

  .portal-resource-browser__filters {
    position: static;
    max-height: none;
  }
}

@media (max-width: 900px) {

  .portal-resource-browser__headline,
  .portal-resource-browser__footer {
    flex-direction: column;
    align-items: stretch;
  }

  .portal-resource-browser__grid {
    grid-template-columns: 1fr;
  }

  .portal-resource-browser__card {
    flex-direction: column;
  }

  .portal-resource-browser__actions {
    justify-content: space-between;
  }
}
</style>
