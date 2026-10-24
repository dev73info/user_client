import { HttpError } from '@/api/http'
import {
  downloadPublicMcResourceVersionFile,
  extractResourceFileNameFromUrl,
  resolveResourceDownloadFileName,
  with73Extension,
  type DownloadProgress,
  type PublicMcResourceVersionItem,
} from '@/api/resources'
import { useAuthStore } from '@/stores/auth'
import { useDownloadStore } from '@/stores/download'

/**
 * 资源文件下载的统一入口：接管全局下载进度条、落盘与登录态失效处理。
 *
 * 资源详情页的下载按钮与「我的需求」需求行的「下载」共用同一份实现，避免两处各写一套
 * blob 下载逻辑后进度条与 401 行为出现分叉。
 */
export function useResourceDownload() {
  const auth = useAuthStore()
  const downloadStore = useDownloadStore()

  async function triggerDownload(
    run: (
      onProgress: (progress: DownloadProgress) => void,
    ) => Promise<{ blob: Blob; fileName: string }>,
    fileName: string,
  ) {
    const downloadFileName = with73Extension(fileName)
    downloadStore.start(downloadFileName)
    try {
      const { blob, fileName: resolvedFileName } = await run((progress) => {
        // 注意：这里不能用 resolvedFileName（它在 await 完成前处于 TDZ），
        // 必须使用外层已初始化的 fileName。
        downloadStore.progress(progress.percent, progress.loaded, progress.total)
      })

      const objectUrl = URL.createObjectURL(blob)
      try {
        const link = document.createElement('a')
        link.href = objectUrl
        // 优先使用从资源 URL 还原出的真实文件名（稳定，不依赖 CORS 暴露 Content-Disposition）；
        // 服务器 Content-Disposition 解析结果仅作为兜底，避免读不到响应头时回退成 resource-{id}-v{version_id}.73。
        const finalFileName = resolveResourceDownloadFileName(fileName, resolvedFileName)
        link.download = with73Extension(finalFileName)
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
      }
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) {
        auth.logout()
        const isHistoryMode = import.meta.env.VITE_ROUTER_MODE === 'history'
        const normalizedPath = window.location.pathname.endsWith('/')
          ? window.location.pathname
          : `${window.location.pathname}/`
        const target = isHistoryMode ? normalizedPath : `${normalizedPath}#/`
        window.location.replace(target)
        throw new Error('未登录或登录已过期，请重新登录')
      }

      throw error
    } finally {
      downloadStore.finish()
    }
  }

  /**
   * 下载某个资源版本的交付文件（需求行「下载」与版本列表共用）。
   *
   * 文件名优先用资源 URL 还原出的真实文件名（`resource-<id>-<版本号>` 只在取不到时兜底），
   * 进度条、落盘与 401 处理都走上面的 `triggerDownload`，不另开一条下载链。
   */
  async function downloadResourceVersion(
    resourceId: number,
    version: PublicMcResourceVersionItem,
    token: string | null,
  ) {
    await triggerDownload(
      (onProgress) =>
        downloadPublicMcResourceVersionFile(resourceId, version.id, token, onProgress),
      extractResourceFileNameFromUrl(version.resource, `resource-${resourceId}-${version.version}`),
    )
  }

  return { triggerDownload, downloadResourceVersion }
}
