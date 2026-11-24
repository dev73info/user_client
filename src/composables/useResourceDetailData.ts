import { computed, onMounted, ref, watch } from 'vue'

import { HttpError } from '@/api/http'
import {
  getPublicMcResource,
  invalidateResourceListCache,
  listPublicMcResourceVersions,
  type PublicMcResourceItem,
  type PublicMcResourceVersionItem,
} from '@/api/resources'
import { useResourceOwnerFee } from '@/composables/useResourceOwnerFee'
import { useAuthStore } from '@/stores/auth'

/**
 * 资源详情面板的取数层：详情 / 版本列表 / 卖家费率提示，以及登录态变化后的赞态重取。
 *
 * 从 `ResourceDetailPanel.vue` 原样搬出（支付深链 `?pay=` 需要给面板腾行数预算）：
 * 失败文案、重试的并发闸（`loading`）、赞态 401 的登出处理都与搬出前逐行一致。
 * 面板只拿 `resource` / `versions` 与重取动作，不再自己发请求。
 */
export function useResourceDetailData(options: { getResourceId: () => number }) {
  const auth = useAuthStore()
  const loading = ref(false)
  /** 面板形态下取数失败时的兜底文案（详情页形态失败会退回首页，不用这个） */
  const loadError = ref('')
  const resource = ref<PublicMcResourceItem | null>(null)
  const versions = ref<PublicMcResourceVersionItem[]>([])

  const isOwner = computed(() => {
    const creator = resource.value?.creator?.trim() ?? ''
    const username = auth.username?.trim() ?? ''
    return Boolean(creator && username && creator === username)
  })

  /** 卖家本人看详情时的费率提示；访客不请求也不展示。 */
  const {
    hint: ownerFeeHint,
    feeError: ownerFeeError,
    load: loadOwnerFee,
  } = useResourceOwnerFee({
    isOwner: () => isOwner.value,
    token: () => auth.token,
    pricePoints: () => Number(resource.value?.price_points ?? 0),
    buyoutPriceFen: () => Number(resource.value?.buyout_price_fen ?? 0),
    versionPrices: () => versions.value.map((item) => Number(item.price_fen ?? 0)),
  })

  function getCurrentResourceId(): number | null {
    const id = Number(options.getResourceId())
    return Number.isInteger(id) && id > 0 ? id : null
  }

  async function refreshResourceDetail() {
    if (!resource.value) {
      return
    }
    const token = auth.token?.trim() ? auth.token : null
    resource.value = await getPublicMcResource(resource.value.id, token)
    invalidateResourceListCache()
  }

  async function refreshResourceLikeState(resourceId: number) {
    try {
      const token = auth.token?.trim() ? auth.token : null
      resource.value = await getPublicMcResource(resourceId, token)
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) {
        auth.logout()
      }
    }
  }

  async function loadResource() {
    const resourceId = getCurrentResourceId()
    if (!resourceId) {
      // 不接管导航：由列表页决定选中是否合法（URL 里的 `?resource=` 可能是脏数据）
      loadError.value = '没有拿到有效的资源编号。'
      return
    }
    if (loading.value) {
      return
    }

    loading.value = true
    loadError.value = ''
    try {
      const token = auth.token?.trim() ? auth.token : null
      const [resourceDetail, resourceVersions] = await Promise.all([
        getPublicMcResource(resourceId, token),
        listPublicMcResourceVersions(resourceId, token),
      ])
      resource.value = resourceDetail
      // 列表按时间倒序：`latestVersion` 取 `versions[0]`，页面展示也与设计稿一致（新版本在上）
      versions.value = [...resourceVersions].sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      )
      await loadOwnerFee()
    } catch (error) {
      // 就地报错，不把整个列表页带回首页
      resource.value = null
      versions.value = []
      // 404 同时覆盖「资源不存在」与「私有 / 待审资源无权查看」，按后端原文显示「not found」对访客没意义
      loadError.value =
        error instanceof HttpError && error.status === 404
          ? '资源不存在或无权访问'
          : error instanceof Error
            ? error.message
            : '加载资源主页失败'
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    auth.hydrate()
    void loadResource()
  })

  watch(options.getResourceId, () => {
    void loadResource()
  })

  watch(
    () => auth.token,
    () => {
      // 评论由 ResourceCommentSection 自己 watch 令牌重拉，这里只管赞态（需要整份资源重取）
      if (resource.value?.id) {
        void refreshResourceLikeState(resource.value.id)
      }
    },
  )

  return {
    loading,
    loadError,
    resource,
    versions,
    isOwner,
    ownerFeeHint,
    ownerFeeError,
    loadResource,
    refreshResourceDetail,
  }
}
