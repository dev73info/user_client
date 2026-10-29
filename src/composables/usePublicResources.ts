import { computed, ref } from 'vue'

import { apiUrl } from '@/api/http'
import { invalidateResourceListCache, type PublicMcResourceItem } from '@/api/resources'
import { useTagTreeStore } from '@/stores/tagTree'

/** 资源详情路由需要的两段标签 slug（与 `resourceDetailLocation` 对接）。 */
export type ResourceRouteSlugs = {
  rootSlug: string
  entrySlug: string
}

/**
 * 首页「公开资源」这一份状态的唯一所有者（R047 从 `views/HomeView.vue` 拆出）。
 *
 * 拆之前 `publicResources` 有 6 个消费方（侧栏榜单、公告卡、资源区、
 * 作者跑马灯、点赞回写、定时刷新），谁都不能自己 new 一份，否则会出现两份数据源、
 * 点赞后卡片与榜单对不上。所以这里把「状态 + 派生 + 三处易漏的副作用」收在一起：
 *
 * - `resolveResourceRoute`：标签树按 `platform` 找根/入口 slug，找不到就用第一组兜底；
 * - `resolveCoverUrl`：封面的相对路径统一过 `apiUrl`，空值给空串交给模板回落；
 * - `applyLikeState`：点赞回写后**必须**失效列表缓存（`invalidateResourceListCache`），
 *   否则退出首页再进来看到的是旧赞数。
 *
 * 请求（`loadPublicPortalData` 里的 `Promise.allSettled`）仍留在视图：那一批与公告、
 * 需求精选、阈值一起发，串行顺序有意义，收进这里会打乱视图 `onMounted` 的时序。
 */
export function usePublicResources() {
  const publicResources = ref<PublicMcResourceItem[]>([])
  /** 首页高赞阈值：由管理端积分规则 `resource_high_like_threshold` 配置，缺省 5。 */
  const highLikeThreshold = ref(5)

  const tagTreeStore = useTagTreeStore()
  const processedTagTree = computed(
    () => tagTreeStore.tree ?? ({ roots: [] } as { roots: never[] }),
  )

  /**
   * 标签树没加载完就点卡片时给 `null`，由调用方提示「目录暂未配置完整标签路由」，
   * 不要在这里兜底成假 slug——错误的 slug 比没有 slug 更难查。
   */
  function resolveResourceRoute(resource: PublicMcResourceItem): ResourceRouteSlugs | null {
    for (const root of processedTagTree.value.roots) {
      const entry = root.entries.find((item) => item.platform === resource.platform)
      if (entry) {
        return {
          rootSlug: root.key,
          entrySlug: entry.key,
        }
      }
    }

    const fallbackRoot = processedTagTree.value.roots[0]
    const fallbackEntry = fallbackRoot?.entries[0]
    if (fallbackRoot && fallbackEntry) {
      return {
        rootSlug: fallbackRoot.key,
        entrySlug: fallbackEntry.key,
      }
    }

    return null
  }

  /** 标签树懒加载：与资源列表同批发起，不 await（失败只影响路由兜底，不影响列表渲染）。 */
  function ensureTagTree() {
    void tagTreeStore.ensure()
  }

  /**
   * 写入最新资源列表：去重（同 id 只留第一条）后按 `updated_at` 倒序。
   * 传 `null` 表示本次请求失败 —— 与旧实现一致，清空而不是保留脏数据。
   */
  function applyResourceList(list: readonly PublicMcResourceItem[] | null) {
    if (!list) {
      publicResources.value = []
      return
    }

    publicResources.value = list
      .filter(
        (resource, index, array) => array.findIndex((item) => item.id === resource.id) === index,
      )
      .sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at))
  }

  /** 阈值来自管理端配置：非数字、0、负数一律忽略，保持缺省 5。 */
  function applyHighLikeThreshold(raw: unknown) {
    const threshold = Number(raw)
    if (Number.isFinite(threshold) && threshold >= 1) {
      highLikeThreshold.value = Math.floor(threshold)
    }
  }

  /** 点赞 / 取消点赞后就地替换那一条，并失效资源列表缓存。 */
  function applyLikeState(resourceId: number, state: { liked_by_me: boolean; like_count: number }) {
    publicResources.value = publicResources.value.map((item) =>
      item.id === resourceId
        ? { ...item, liked_by_me: state.liked_by_me, like_count: state.like_count }
        : item,
    )
    invalidateResourceListCache()
  }

  /** 封面的相对路径统一过 `apiUrl`；空值给空串，让卡片回落到首字占位块。 */
  function resolveCoverUrl(raw?: string | null): string {
    return raw ? apiUrl(raw) : ''
  }

  return {
    publicResources,
    highLikeThreshold,
    processedTagTree,
    resolveResourceRoute,
    ensureTagTree,
    applyResourceList,
    applyHighLikeThreshold,
    applyLikeState,
    resolveCoverUrl,
  }
}
