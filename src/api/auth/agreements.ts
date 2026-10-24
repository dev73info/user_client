import { requestJson } from '@/api/http'

import type { AgreementContent, UserServiceAgreement } from './types'

export async function fetchUserServiceAgreement(): Promise<UserServiceAgreement> {
  return requestJson<UserServiceAgreement>(
    '/auth/user-service-agreement',
    { headers: {} },
    '加载用户服务协议失败',
  )
}

/**
 * 读取协议 / 配套附件的正文（公开，无需登录）。
 *
 * 白名单外的 code 后端返回 404（例如 `default_requirement` 不在白名单，
 * 需求合同正文要走合同详情接口）。
 */
export async function fetchAgreementContent(code: string): Promise<AgreementContent> {
  const query = new URLSearchParams({ code })
  return requestJson<AgreementContent>(
    `/auth/agreement-content?${query.toString()}`,
    { headers: {} },
    '加载协议内容失败',
  )
}
