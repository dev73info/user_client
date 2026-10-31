import { requestJson } from '@/api/http'

import type { UserServiceAgreement } from './types'

export async function fetchUserServiceAgreement(): Promise<UserServiceAgreement> {
  return requestJson<UserServiceAgreement>(
    '/auth/user-service-agreement',
    { headers: {} },
    '加载用户服务协议失败',
  )
}

/**
 * 取公示协议或平台规则正文（免登录）。
 *
 * `code` 必须是后端公示清单里的代号：用户服务协议、隐私政策、支付与退款说明与规则中心的规则。
 * 未配置回 404 `AGREEMENT_NOT_CONFIGURED`。
 */
export async function fetchAgreementContent(code: string): Promise<UserServiceAgreement> {
  return requestJson<UserServiceAgreement>(
    `/auth/agreement-content?code=${encodeURIComponent(code)}`,
    { headers: {} },
    '加载协议正文失败',
  )
}
