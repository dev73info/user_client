import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'

import {
  getMcPluginPlatformEntries,
  getTagRouteSlug,
  type McPluginPlatformEntry,
} from '@/api/resourceTags'
import { useResourceCatalogListing } from '@/composables/useResourceCatalogListing'
import {
  isCatalogMobileWidth,
  parseResourceIdParam,
  resolveCatalogRoot,
  withSaleQuery,
  withoutSelectionQuery,
  type CatalogRootTab,
} from '@/shared/resourceCatalogDisplay'
import { resolveResourceListingSale, type ResourceListingSale } from '@/shared/resourceSale'
import { useTagTreeStore } from '@/stores/tagTree'

import { TMessage } from 'ui_73info'

/**
 * 资源目录页的数据与动作。
 *
 * 从 `views/ResourceCatalogView.vue` 抽出：页面只负责排版，专区 / 子分区页签、免费付费分区、
 * 页内详情（`?resource=`）、视口分档都在这里；列表读数与工具条命令口见
 * `@/composables/useResourceCatalogListing`。逻辑与文案口径没有变化，逐段注释见各函数。
 */
export function useResourceCatalogPage() {
  const router = useRouter()
  const route = useRoute()
  const tagTreeStore = useTagTreeStore()

  const listing = useResourceCatalogListing()

  /**
   * 当前选中的资源（列表页的页内详情：桌面端与移动端都走它）。
   *
   * 选中态落在 URL 上（`?resource=<id>`），刷新 / 复制分享可还原；它只是**同一路由内的 query 变化**，
   * 页面组件不会卸载重挂。选中后列表整块收起、详情独占内容区（见模板）。
   */
  const selectedResourceId = ref<number | null>(null)

  function syncSelectionFromQuery() {
    selectedResourceId.value = parseResourceIdParam(route.query.resource)
  }

  /**
   * 选中项只在当前列表里成立：换专区 / 子分区 / 免费付费分区时把它从 query 中摘掉
   * （否则会出现「地址上选中的是付费资源、左边却在看免费分区」这种对不上的状态）。
   *
   * R029：推广码 `?promo=` 只在「当前详情就是分享链接指向的那条资源」时有效，所以关闭详情、
   * 换分区 / 换分类时与 `resource` 一起摘掉——不然从 A 的推广链接进来再切到别的资源下单，
   * 会把别的资源的订单记成 A 带来的（错误归因）。
   */
  function withoutSelection(query: LocationQueryRaw = {}): LocationQueryRaw {
    return withoutSelectionQuery(query)
  }

  /** 列表里点了「查看详情」：就地选中并写回 URL，不跳独立详情路由 */
  function selectResource(id: number) {
    if (selectedResourceId.value === id) {
      return
    }
    selectedResourceId.value = id
    // R029：换一条资源就等于放弃这次推广归因——推广码只对分享链接指向的那条资源有效，
    // 跟着选中项一起写下去会让 B 的订单带上 A 的码（错误归因）。
    const query: LocationQueryRaw = { ...route.query, resource: String(id) }
    delete query.promo
    void router.replace({ query })
  }

  /** 退出详情（工具条「返回」与窄屏面板内的返回控件都走这里）：清掉选中并把它从 URL 上摘掉（其余 query 一律保留） */
  function clearSelectedResource() {
    selectedResourceId.value = null
    if ('resource' in route.query) {
      void router.replace({ query: withoutSelection(route.query) })
    }
  }

  watch(() => route.query.resource, syncSelectionFromQuery, { immediate: true })

  // 免费 / 付费的页内切换是「本地状态 + 路由 `?sale=`」：
  // 点击先本地切（列表立刻换，不等导航），再把分区写回 URL。
  // 连点靠自增序号丢弃过期导航，避免旧 replace 的收尾把 pending 又改回去。
  const pendingListingMode = ref<ResourceListingSale | null>(null)
  let listingSwitchSeq = 0

  const activeListingMode = computed<ResourceListingSale>(
    () => pendingListingMode.value ?? resolveResourceListingSale(route.query.sale),
  )

  async function switchListingMode(mode: ResourceListingSale) {
    if (mode === activeListingMode.value && pendingListingMode.value === null) {
      return
    }

    const seq = ++listingSwitchSeq
    pendingListingMode.value = mode
    // 换分区等于换一批数据，右栏的选中项随之作废。
    // 这里只清本地状态不单独导航：下面这次 replace 会用 withoutSelection 把 `?resource=` 一并摘掉，
    // 连续两次 replace 只会白跑一次历史记录。
    selectedResourceId.value = null
    try {
      await router.replace({ query: { ...withoutSelection(route.query), sale: mode } })
    } catch {
      // 导航被更新的一次切换打断（或重复导航）时忽略，按序号决定谁收尾
    } finally {
      if (seq === listingSwitchSeq) {
        pendingListingMode.value = null
      }
    }
  }

  /** 分类跳转沿用的 query：分区（`?sale=`）始终带上，切根 / 二级分区也不丢。 */
  function withListingQuery(query: LocationQueryRaw = {}): LocationQueryRaw {
    return withSaleQuery(query, activeListingMode.value)
  }

  const rootTabs = ref<CatalogRootTab[]>([])
  const platformTabs = ref<McPluginPlatformEntry[]>([])
  const currentRootName = ref('')
  const currentRootSlug = computed(() => {
    const raw = route.params.rootSlug
    return typeof raw === 'string' ? getTagRouteSlug(raw) : ''
  })
  const currentEntrySlug = computed(() => {
    const raw = route.params.entrySlug
    return typeof raw === 'string' ? getTagRouteSlug(raw) : ''
  })
  const currentTab = computed(() => {
    return (
      platformTabs.value.find((tab) => tab.slug === currentEntrySlug.value) ??
      platformTabs.value[0] ??
      null
    )
  })
  const currentPlatform = computed(() => currentTab.value?.platform ?? '')
  const currentEntryLabel = computed(() => currentTab.value?.groupName ?? '当前分区')

  function openPlatform(entrySlug: string) {
    if (entrySlug === currentEntrySlug.value) {
      return
    }

    // 换子分区即换一批资源：右栏的选中项作废（只清本地状态，URL 交给下面这次 push 一并改写）
    selectedResourceId.value = null
    router.push({
      name: 'resource-catalog',
      params: { rootSlug: currentRootSlug.value, entrySlug },
      query: withListingQuery(withoutSelection(route.query)),
    })
  }

  function openRoot(rootSlug: string, firstEntrySlug: string | null) {
    if (rootSlug === currentRootSlug.value) {
      return
    }

    selectedResourceId.value = null
    router.push({
      name: 'resource-catalog',
      params: firstEntrySlug ? { rootSlug, entrySlug: firstEntrySlug } : { rootSlug },
      query: withListingQuery(withoutSelection(route.query)),
    })
  }

  /** 面包屑里的根分区是下拉：换专区仍走 openRoot，行为与原来的专区行一致 */
  function handleRootCommand(command: unknown) {
    const rootSlug = String(command)
    const root = rootTabs.value.find((item) => item.slug === rootSlug)
    if (!root) {
      return
    }

    openRoot(root.slug, root.firstEntrySlug)
  }

  async function loadPlatformTabs() {
    try {
      const tree = await tagTreeStore.ensure()

      rootTabs.value = tree.roots.map((root) => ({
        slug: root.key,
        label: root.label,
        firstEntrySlug: root.first_entry_key,
      }))

      const resolvedRoot = resolveCatalogRoot(tree, currentRootSlug.value)
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

      const needsCatalogRoute =
        route.name === 'resources' ||
        currentRootSlug.value !== resolvedRoot.key ||
        !platformTabs.value.some((tab) => tab.slug === currentEntrySlug.value)

      if (needsCatalogRoute) {
        await router.replace({
          name: 'resource-catalog',
          params: { rootSlug: resolvedRoot.key, entrySlug: firstTab.slug },
          query: withListingQuery({ ...route.query }),
        })
      } else if (route.query.sale !== activeListingMode.value) {
        // 地址上没有分区（或分区非法）时补上当前分区，刷新 / 分享后落在同一个列表
        await router.replace({
          query: withListingQuery({ ...route.query }),
        })
      }
    } catch (err) {
      TMessage.warning(err instanceof Error ? err.message : '加载资源目录失败')
    }
  }

  /** 窄屏（≤900px）走移动端列表：工具条不渲染，退出口在面板内的返回控件上。 */
  const isMobile = ref(false)

  function updateViewport() {
    isMobile.value = isCatalogMobileWidth(window.innerWidth)
  }

  onMounted(() => {
    updateViewport()
    window.addEventListener('resize', updateViewport)
    void loadPlatformTabs()
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', updateViewport)
  })

  watch(
    () => [currentRootSlug.value, currentEntrySlug.value],
    () => {
      void loadPlatformTabs()
    },
  )

  return {
    // 列表读数与工具条命令口
    ...listing,
    // 专区 / 子分区页签
    rootTabs,
    platformTabs,
    currentRootName,
    currentRootSlug,
    currentEntrySlug,
    currentTab,
    currentPlatform,
    currentEntryLabel,
    handleRootCommand,
    openPlatform,
    // 免费 / 付费分区
    activeListingMode,
    switchListingMode,
    // 页内详情
    selectedResourceId,
    selectResource,
    clearSelectedResource,
    // 视口
    isMobile,
  }
}
