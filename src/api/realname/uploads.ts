import { authHeader, requestJson } from '@/api/http'

import type { GuardianConsentUploadResponse } from './types'

/**
 * 上传监护人同意书（唯一保留在服务器上的实名材料，后端 AES-256-GCM 加密落盘）。
 */
export async function uploadGuardianConsentFile(
  token: string,
  file: File,
): Promise<GuardianConsentUploadResponse> {
  const formData = new FormData()
  formData.append('file', file)

  return requestJson<GuardianConsentUploadResponse>(
    '/realname/consent-file',
    {
      method: 'POST',
      headers: {
        ...authHeader(token),
      },
      body: formData,
    },
    '上传监护人同意书失败',
  )
}
