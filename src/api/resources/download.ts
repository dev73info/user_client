import { HttpError, apiUrl, authHeader, readErrorMessage } from '@/api/http'

import { PUBLIC_RESOURCE_API_PREFIX } from './types'
import type { DownloadProgress } from './types'

function isDownloadPlaceholder(fileName: string): boolean {
  const normalized = fileName.trim().toLowerCase()
  return (
    normalized === 'download' || normalized === 'download.73' || normalized.endsWith('.package')
  )
}

export function resolveResourceDownloadFileName(
  fileName: string | null | undefined,
  fallbackFileName: string,
): string {
  const normalized = fileName?.trim() ?? ''
  const fallback = fallbackFileName.trim() || 'resource'
  return !normalized || isDownloadPlaceholder(normalized) ? fallback : normalized
}

function getResponseFileName(response: Response, fallbackFileName: string): string {
  const disposition = response.headers.get('content-disposition') ?? ''
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    return extractResourceFileNameFromUrl(decodeURIComponent(utf8Match[1]), fallbackFileName)
  }

  const plainMatch = disposition.match(/filename="?([^";]+)"?/i)
  if (plainMatch?.[1]) {
    return extractResourceFileNameFromUrl(plainMatch[1], fallbackFileName)
  }

  return resolveResourceDownloadFileName(fallbackFileName, fallbackFileName)
}

/**
 * 从资源文件 URL（`/uploads/resource-versions/{resource_id}/{uuid}-{original_name}`）中
 * 提取真实文件名：去掉 `{uuid}-` 前缀，还原上传时的原始文件名。
 * 若 URL 不符合该格式则返回 fallback。
 */
export function extractResourceFileNameFromUrl(path: string, fallbackFileName: string): string {
  try {
    const raw = path.split('?')[0] ?? ''
    const segments = raw.split('/').filter(Boolean)
    const last = segments[segments.length - 1] ?? ''
    if (!last) {
      return fallbackFileName
    }

    // 匹配 `{uuid}-{original_name}` 形式：uuid 通常为 36 位（含连字符）
    const uuidMatch = last.match(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-(.+)$/i,
    )
    if (uuidMatch?.[1]) {
      return resolveResourceDownloadFileName(decodeURIComponent(uuidMatch[1]), fallbackFileName)
    }

    // 兼容：如果没有 uuid 前缀，直接用文件名；但排除 `.package` 占位名
    if (last.toLowerCase().endsWith('.package')) {
      return resolveResourceDownloadFileName(fallbackFileName, fallbackFileName)
    }
    return resolveResourceDownloadFileName(decodeURIComponent(last), fallbackFileName)
  } catch {
    return resolveResourceDownloadFileName(fallbackFileName, fallbackFileName)
  }
}

/** 在原始资源文件名后追加 .73，保留原有扩展名。 */
export function with73Extension(fileName: string, fallbackFileName = 'resource'): string {
  const normalized = resolveResourceDownloadFileName(fileName, fallbackFileName)
  return normalized.toLowerCase().endsWith('.73') ? normalized : `${normalized}.73`
}

export async function downloadPublicMcResourceFile(
  path: string,
  fallbackFileName: string,
  token?: string | null,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<{ blob: Blob; fileName: string }> {
  const response = await fetch(apiUrl(path), {
    method: 'GET',
    headers: token ? authHeader(token) : undefined,
    credentials: 'omit',
  })

  if (!response.ok) {
    throw new HttpError(response.status, await readErrorMessage(response, '下载资源失败'))
  }

  const contentLength = Number(response.headers.get('content-length') ?? '0')
  const total = Number.isFinite(contentLength) && contentLength > 0 ? contentLength : 0

  // 无 Content-Length 或无法流式读取时，退化为一次性读取（无进度）。
  if (!response.body || !total) {
    onProgress?.({ loaded: total, total, percent: 100 })
    return {
      blob: await response.blob(),
      fileName: getResponseFileName(response, fallbackFileName),
    }
  }

  const reader = response.body.getReader()
  const chunks: BlobPart[] = []
  let loaded = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    chunks.push(value as unknown as BlobPart)
    loaded += value.byteLength
    onProgress?.({
      loaded,
      total,
      percent: total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0,
    })
  }

  const blob = new Blob(chunks, {
    type: response.headers.get('content-type') ?? 'application/octet-stream',
  })
  onProgress?.({ loaded, total, percent: 100 })
  return {
    blob,
    fileName: getResponseFileName(response, fallbackFileName),
  }
}

// 通过版本下载接口下载资源文件，后端会累计下载量。
export async function downloadPublicMcResourceVersionFile(
  resourceId: number,
  versionId: number,
  token?: string | null,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<{ blob: Blob; fileName: string }> {
  return downloadPublicMcResourceFile(
    `${PUBLIC_RESOURCE_API_PREFIX}/${resourceId}/versions/${versionId}/download`,
    `resource-${resourceId}-v${versionId}`,
    token,
    onProgress,
  )
}
