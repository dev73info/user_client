import { ref, type Ref } from 'vue'

import { TMessage } from 'ui_73info'

import { HttpError } from '@/api/http'
import {
  listPublicMcResourceVersions,
  type PublicMcResourceItem,
  type PublicMcResourceVersionItem,
} from '@/api/resources'
import { usePortalAuthPrompt } from '@/composables/usePortalAuthPrompt'
import { useResourceDownload } from '@/composables/useResourceDownload'
import type { SpotlightCard } from '@/composables/useSpotlightCards'
import { describeBackendError } from '@/shared/backendErrorText'
import { isPurchaseRequiredError, isPricedResource } from '@/shared/resourceSale'
import { useAuthStore } from '@/stores/auth'

/**
 * 首页精选卡「下载量」入口：免费资源直接下载当前版本，付费资源回到详情购买。
 *
 * 下载本身复用全站唯一的 `useResourceDownload`（进度条、落盘、401 处理都在那里），
 * 这里只负责卡片 → 资源、版本选择、登录门禁与 403 购买引导。
 */
export function useSpotlightDownload(options: {
  publicResources: Ref<PublicMcResourceItem[]>
  openSpotlight: (card: SpotlightCard) => void
}) {
  const auth = useAuthStore()
  const { openLogin } = usePortalAuthPrompt()
  const { downloadResourceVersion } = useResourceDownload()
  const spotlightDownloadSubmittingIds = ref<Set<number>>(new Set())

  function setSubmitting(resourceId: number, submitting: boolean) {
    const next = new Set(spotlightDownloadSubmittingIds.value)
    if (submitting) {
      next.add(resourceId)
    } else {
      next.delete(resourceId)
    }
    spotlightDownloadSubmittingIds.value = next
  }

  function pickCurrentVersion(
    versions: PublicMcResourceVersionItem[],
  ): PublicMcResourceVersionItem | null {
    return versions.find((version) => version.is_current) ?? versions[0] ?? null
  }

  async function downloadSpotlight(card: SpotlightCard) {
    const resourceId = card.resourceId
    if (resourceId == null) {
      options.openSpotlight(card)
      return
    }

    const resource = options.publicResources.value.find((item) => item.id === resourceId)
    if (!resource) {
      TMessage.info('资源详情正在加载中')
      return
    }
    if (
      isPricedResource(
        resource.buyout_price_fen,
        resource.price_points,
        resource.min_version_price_fen,
      )
    ) {
      options.openSpotlight(card)
      return
    }
    if (!auth.isAuthed || !auth.token.trim()) {
      TMessage.info('请先登录后再下载资源')
      void openLogin()
      return
    }
    if (spotlightDownloadSubmittingIds.value.has(resourceId)) {
      return
    }

    setSubmitting(resourceId, true)
    try {
      const versions = await listPublicMcResourceVersions(resourceId, auth.token)
      const version = pickCurrentVersion(versions)
      if (!version) {
        TMessage.info('当前还没有可下载的版本')
        return
      }
      await downloadResourceVersion(resourceId, version, auth.token.trim() || null)
    } catch (error) {
      const message = describeBackendError(error, '下载资源失败')
      if (error instanceof HttpError && error.status === 403 && isPurchaseRequiredError(message)) {
        TMessage.warning('请先购买该资源后再下载')
        options.openSpotlight(card)
        return
      }
      TMessage.warning(message)
    } finally {
      setSubmitting(resourceId, false)
    }
  }

  return { spotlightDownloadSubmittingIds, downloadSpotlight }
}
