import { HttpError } from '@/api/http'
import {
  resolveResourceDownloadFileName,
  with73Extension,
  type DownloadProgress,
} from '@/api/resources'
import { useAuthStore } from '@/stores/auth'
import { useDownloadStore } from '@/stores/download'

/**
 * 资源文件下载的统一入口：接管全局下载进度条、落盘与登录态失效处理。
 *
 * 资源主页卡片与「我的定制资源」卡片共用同一份实现，避免两处各写一套
 * blob 下载逻辑后进度条与 401 行为出现分叉。
 */
export function useResourceDownload() {
  const auth = useAuthStore()
  const downloadStore = useDownloadStore()

  async function triggerDownload(
    run: (onProgress: (progress: DownloadProgress) => void) => Promise<{ blob: Blob; fileName: string }>,
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

  return { triggerDownload }
}
