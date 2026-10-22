import { authHeaders, requestJson } from '@/api/http'

import type { BusinessLicenseOcrResult, LegalCertOcrResult, LegalCertOcrSide } from './types'

/**
 * 让后端 OCR 识别刚上传的营业执照，用于**辅助填写**企业信息。
 *
 * 失败（图片不清晰、PDF、渠道异常）会抛错，调用方应提示手工填写即可，不要阻断提交流程。
 * 响应里不含渠道流水号：后端只回白名单字段。
 */
export async function ocrBusinessLicense(
  token: string,
  businessLicenseFile: string,
): Promise<BusinessLicenseOcrResult> {
  return requestJson<BusinessLicenseOcrResult>(
    '/realname/business-license-ocr',
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ business_license_file: businessLicenseFile }),
    },
    '营业执照识别失败',
  )
}

/** 后端返回体的原始形状：两种命名都收（见 `recognizeLegalCertPeriod` 的注释）。 */
type RawLegalCertOcrResult = {
  cert_begin_on?: string | null
  cert_expires_on?: string | null
  certBeginOn?: string | null
  certExpiresOn?: string | null
}

/**
 * 让后端 OCR 识别**已上传**的法人身份证，取出证件有效期起止，用于辅助填写「法人证件有效期」。
 *
 * 后端按 `side` 从 `realname_legal_cert` 取对应的那张已上传照片（本地压图后）送爱签识别，
 * 所以必须先上传照片再调；对应面还没上传时后端回 400（中文提示「请先上传…」）。
 *
 * 失败（图片不清晰、渠道异常、未上传）会抛错，调用方应**静默降级**：保留手填、不阻断提交。
 *
 * 字段名两种写法都收：任务书里写的是 `certBeginOn` / `certExpiresOn`，后端定稿的契约
 * （R025 任务-02）是 `cert_begin_on` / `cert_expires_on`——与本模块营业执照 OCR 的命名一致。
 * **以后端为准**，这里再做一层兼容读取，免得两种命名之间来回改。
 */
export async function recognizeLegalCertPeriod(
  token: string,
  side: LegalCertOcrSide = 'front',
): Promise<LegalCertOcrResult> {
  const raw = await requestJson<RawLegalCertOcrResult>(
    '/realname/legal-cert-ocr',
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ side }),
    },
    '法人证件有效期识别失败',
  )
  return {
    cert_begin_on: raw.cert_begin_on ?? raw.certBeginOn ?? null,
    cert_expires_on: raw.cert_expires_on ?? raw.certExpiresOn ?? null,
  }
}
