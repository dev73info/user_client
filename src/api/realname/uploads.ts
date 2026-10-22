import { authHeader, requestJson } from '@/api/http'

import type {
  BusinessLicenseUploadResponse,
  GuardianConsentUploadResponse,
  LegalCertBackUploadResponse,
  LegalCertFrontUploadResponse,
} from './types'

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

export async function uploadBusinessLicenseFile(
  token: string,
  file: File,
): Promise<BusinessLicenseUploadResponse> {
  const formData = new FormData()
  formData.append('file', file)

  return requestJson<BusinessLicenseUploadResponse>(
    '/realname/business-license-file',
    {
      method: 'POST',
      headers: {
        ...authHeader(token),
      },
      body: formData,
    },
    '上传营业执照失败',
  )
}

/**
 * 上传法人身份证**人像面**照片（企业开户进件三张证照之一）。
 *
 * 与营业执照不同，此接口**上传即落库**（后端写进 `realname_legal_cert.front_file`），
 * 进件时由另一个链路读取，所以返回值**不需要**再塞进提交实名的 payload。
 */
export async function uploadLegalCertFrontFile(
  token: string,
  file: File,
): Promise<LegalCertFrontUploadResponse> {
  const formData = new FormData()
  formData.append('file', file)

  return requestJson<LegalCertFrontUploadResponse>(
    '/realname/legal-cert-front-file',
    {
      method: 'POST',
      headers: {
        ...authHeader(token),
      },
      body: formData,
    },
    '上传法人身份证人像面失败',
  )
}

/** 上传法人身份证**国徽面**照片（同 `uploadLegalCertFrontFile`，上传即落库）。 */
export async function uploadLegalCertBackFile(
  token: string,
  file: File,
): Promise<LegalCertBackUploadResponse> {
  const formData = new FormData()
  formData.append('file', file)

  return requestJson<LegalCertBackUploadResponse>(
    '/realname/legal-cert-back-file',
    {
      method: 'POST',
      headers: {
        ...authHeader(token),
      },
      body: formData,
    },
    '上传法人身份证国徽面失败',
  )
}
