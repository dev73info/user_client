import { HttpError, apiUrl, authHeader, readErrorMessage } from '@/api/http'

import type { DownloadedContractFile } from './types'

/** 从 `Content-Disposition` 还原文件名（UTF-8 优先，其次普通 filename）。 */
function fileNameFromDisposition(disposition: string | null): string {
  const value = disposition ?? ''
  const utf8Match = value.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]).trim()
    } catch {
      return utf8Match[1].trim()
    }
  }
  const plainMatch = value.match(/filename="?([^";]+)"?/i)
  return plainMatch?.[1]?.trim() ?? ''
}

function base64ToBlob(base64: string, mime: string): Blob {
  const binary = window.atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type: mime || 'application/octet-stream' })
}

/**
 * 附件与空白模板的**鉴权下载**。
 *
 * 附件按任务-01 被排除在 `/uploads/**` 公开静态目录之外，只能走带令牌的接口取字节；
 * 后端有两种既有返回风格（原始字节流 / `{ file_name, file_content }` 的 base64 JSON，
 * 与爱签合同下载同风格），这里按 `Content-Type` 兼容两者，前端不必假定是哪一种。
 */
async function fetchAuthedContractFile(
  token: string,
  path: string,
  fallbackFileName: string,
  fallbackError: string,
): Promise<DownloadedContractFile> {
  const resp = await fetch(apiUrl(path), {
    headers: authHeader(token),
    credentials: 'omit',
  })
  if (!resp.ok) {
    throw new HttpError(resp.status, await readErrorMessage(resp, fallbackError))
  }

  const contentType = (resp.headers.get('content-type') ?? '').toLowerCase()
  if (contentType.includes('application/json')) {
    const payload = (await resp.json()) as {
      file_name?: string | null
      file_content?: string | null
    }
    const base64 = (payload.file_content ?? '').trim()
    if (!base64) {
      throw new Error(`${fallbackError}：接口未返回文件内容`)
    }
    const fileName = (payload.file_name ?? '').trim() || fallbackFileName
    return { blob: base64ToBlob(base64, ''), fileName }
  }

  const dispositionName = fileNameFromDisposition(resp.headers.get('content-disposition'))
  return { blob: await resp.blob(), fileName: dispositionName || fallbackFileName }
}

/** 下载合同附件原件（走鉴权接口，不是 `/uploads/**` 裸链）。 */
export function downloadContractAttachment(
  token: string,
  contractId: number,
  fallbackFileName = '合同附件',
): Promise<DownloadedContractFile> {
  return fetchAuthedContractFile(
    token,
    `/contracts/${contractId}/attachment`,
    fallbackFileName,
    '下载合同附件失败',
  )
}

/** 下载空白合同模板 docx（登录即可，供双方在本地整理条款后再上传）。 */
export function downloadBlankContractTemplate(token: string): Promise<DownloadedContractFile> {
  return fetchAuthedContractFile(
    token,
    '/contracts/attachment/blank-template',
    '需求开发合同模板.docx',
    '下载合同模板失败',
  )
}
