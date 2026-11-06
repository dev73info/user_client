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
  /**
   * 按版本售卖的资源（资源级标价 0、版本价 > 0）是否需要先买权益。
   *
   * 后端下载判定看版本价，只看资源级 `needsPurchase` 会把这类资源当成免费，
   * 让下载按钮先打一次必然 403 的请求。命中这里就直接开购买面板。
   */
  needsVersionPurchase?: () => boolean
  /**
   * 打开购买面板。`version` 是本次下载被 403 拦截的版本：
   * 版本售卖资源（资源级买断价为 0）要按版本下单，面板必须带上这个上下文。
   */
  openPurchasePanel: (version?: PublicMcResourceVersionItem | null) => Promise<void>
  /**
   * 把「要下载的版本」换算成购买面板真正要下单的版本。
   *
   * 0 价版本不可单卖：失败版本本身不可购时不能原样交给面板（后端会 409），
   * 要改成整包购买（返回 null）或最低价可购版本。缺省直接沿用原版本。
   */
  resolvePurchaseVersion?: (
    version: PublicMcResourceVersionItem | null,
  ) => PublicMcResourceVersionItem | null
}) {
  const route = useRoute()
  const router = useRouter()
  const auth = useAuthStore()
  const { triggerDownload } = useResourceDownload()

  /** 购买目标版本：与 403 兜底同一套换算，避免把不可单卖的 0 价版本送去下单。 */
  function resolvePurchaseTarget(
    version: PublicMcResourceVersionItem | null,
  ): PublicMcResourceVersionItem | null {
    return options.resolvePurchaseVersion
      ? options.resolvePurchaseVersion(version)
      : (version ?? null)
  }

  async function handleDownloadError(error: unknown, version?: PublicMcResourceVersionItem | null) {
    const message = describeBackendError(error, '下载资源失败')
    if (error instanceof HttpError && error.status === 403 && isPurchaseRequiredError(message)) {
      TMessage.warning('请先购买该资源后再下载')
      void options.openPurchasePanel(resolvePurchaseTarget(version ?? null))
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
    // 版本售卖资源（资源级标价 0、版本价 > 0）：先买权益，不发注定 403 的下载请求
    if (options.needsVersionPurchase?.()) {
      void options.openPurchasePanel(resolvePurchaseTarget(null))
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
      await handleDownloadError(error, latestVersion)
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
    // 版本售卖资源：按被点的版本开购买面板（0 价版本由 resolvePurchaseVersion 换成可购目标）
    if (options.needsVersionPurchase?.()) {
      void options.openPurchasePanel(resolvePurchaseTarget(version))
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
      await handleDownloadError(error, version)
    }
  }

  return { openResourceFile, downloadVersion }
}
