import { useRoute, useRouter } from 'vue-router'
import { TMessage } from 'ui_73info'

import { HttpError } from '@/api/http'
import {
  downloadPublicMcResourceVersionFile,
  extractResourceFileNameFromUrl,
  resolveResourceDownloadFileName,
  type PublicMcResourceItem,
  type PublicMcResourceVersionItem,
} from '@/api/resources'
import { describeBackendError } from '@/shared/backendErrorText'
import { isPurchaseRequiredError } from '@/shared/resourceSale'
import { useAuthStore } from '@/stores/auth'
import { useResourceDownload } from '@/composables/useResourceDownload'

/**
 * 资源详情面板的下载动作：拉最新版本、拉指定历史版本、未登录引导登录、
 * 以及 403「需先购买」时转去买购买面板。
 *
 * 从 `ResourceDetailPanel.vue` 整块搬出来，判断顺序与文案原样保留（先看有没有版本、
 * 再看编号、再看是否需要购买、最后才要求登录）。资源对象仍由调用方持有，
 * 这里只通过 `getResource` / `getLatestVersion` 读。
 */
export function useResourceFileDownload(options: {
  getResource: () => PublicMcResourceItem | null
  getLatestVersion: () => PublicMcResourceVersionItem | null
  /** 需要先购买才能下载（平台内有购买入口） */
  needsPurchase: () => boolean
  openPurchasePanel: () => Promise<void>
}) {
  const route = useRoute()
  const router = useRouter()
  const auth = useAuthStore()
  const { triggerDownload } = useResourceDownload()

  async function handleDownloadError(error: unknown) {
    const message = describeBackendError(error, '下载资源失败')
    if (error instanceof HttpError && error.status === 403 && isPurchaseRequiredError(message)) {
      TMessage.warning('请先购买该资源后再下载')
      void options.openPurchasePanel()
      return
    }
    TMessage.warning(message)
  }

  /** 下载资源需登录：未登录时提示并引导到登录弹窗。 */
  function requireDownloadLogin(): boolean {
    if (auth.isAuthed && auth.token.trim()) {
      return true
    }
    TMessage.info('请先登录后再下载资源')
    void router.push({
      name: 'home',
      query: {
        modal: 'auth',
        mode: 'login',
        redirect_to: route.fullPath,
      },
    })
    return false
  }

  async function openResourceFile() {
    const latestVersion = options.getLatestVersion()
    if (!latestVersion?.resource) {
      TMessage.info('当前还没有可下载的历史版本')
      return
    }

    const resourceId = options.getResource()?.id
    if (resourceId == null) {
      TMessage.warning('资源编号无效')
      return
    }
    if (options.needsPurchase()) {
      void options.openPurchasePanel()
      return
    }
    if (!requireDownloadLogin()) {
      return
    }
    const fallbackFileName = resolveResourceDownloadFileName(
      options.getResource()?.file_name,
      `resource-${resourceId}-v${latestVersion.id}`,
    )
    const fileName = extractResourceFileNameFromUrl(latestVersion.resource, fallbackFileName)
    try {
      await triggerDownload(
        (onProgress) =>
          downloadPublicMcResourceVersionFile(
            resourceId,
            latestVersion.id,
            auth.token?.trim() || null,
            onProgress,
          ),
        fileName,
      )
    } catch (error) {
      await handleDownloadError(error)
    }
  }

  async function downloadVersion(version: PublicMcResourceVersionItem) {
    const resourceId = options.getResource()?.id
    if (resourceId == null) {
      TMessage.warning('资源编号无效')
      return
    }
    if (options.needsPurchase()) {
      void options.openPurchasePanel()
      return
    }
    if (!requireDownloadLogin()) {
      return
    }
    const fallbackFileName = resolveResourceDownloadFileName(
      options.getResource()?.file_name,
      `resource-${resourceId}-v${version.id}`,
    )
    const fileName = extractResourceFileNameFromUrl(version.resource, fallbackFileName)
    try {
      await triggerDownload(
        (onProgress) =>
          downloadPublicMcResourceVersionFile(
            resourceId,
            version.id,
            auth.token?.trim() || null,
            onProgress,
          ),
        fileName,
      )
    } catch (error) {
      await handleDownloadError(error)
    }
  }

  return { openResourceFile, downloadVersion }
}
