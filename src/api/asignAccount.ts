import { authHeaders, requestJson } from '@/api/http'

/** 爱签账户管理接口统一响应。 */
export type AsignAccountResponse<T = unknown> = {
  success: boolean
  data?: T | null
}

export type SendVerifyCodePayload = { mobile: string }

export type ModifyMobileByCodePayload = { mobile: string; code: string; ctoken: string }

/** 修改绑定手机号（运营商三要素校验），无需短信验证码。 */
export type ModifyMobileThreePayload = { name: string; idCard: string; mobile: string }

export type ModifyCompanyInfoPayload = {
  companyName?: string
  name?: string
  idCard?: string
  idCardType?: number
}

export type ModifyUserNamePayload = {
  name: string
  identifyType: number
  mobile?: string
  bankCard?: string
}

export type ReAuthUserPayload = { serialNo: string; contactName?: string; contactIdCard?: string }

function post<T>(token: string, path: string, payload: unknown, fallback: string) {
  return requestJson<AsignAccountResponse<T>>(
    path,
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    },
    fallback,
  )
}

export async function sendVerifyCode(token: string, payload: SendVerifyCodePayload) {
  return post<{ codeToken?: string }>(
    token,
    '/realname/asign-account/send-verify-code',
    payload,
    '发送验证码失败',
  )
}

export async function modifyMobileByCode(token: string, payload: ModifyMobileByCodePayload) {
  return post<void>(
    token,
    '/realname/asign-account/modify-mobile-by-code',
    payload,
    '修改手机号失败',
  )
}

export async function modifyMobileThree(token: string, payload: ModifyMobileThreePayload) {
  return post<void>(
    token,
    '/realname/asign-account/modify-mobile-three',
    payload,
    '修改手机号失败',
  )
}

export async function modifyCompanyInfo(token: string, payload: ModifyCompanyInfoPayload) {
  return post<string | null>(
    token,
    '/realname/asign-account/modify-company-info',
    payload,
    '修改企业信息失败',
  )
}

export async function modifyUserName(token: string, payload: ModifyUserNamePayload) {
  return post<string | null>(
    token,
    '/realname/asign-account/modify-user-name',
    payload,
    '修改个人信息失败',
  )
}

export async function reAuthUser(token: string, payload: ReAuthUserPayload) {
  return post<string | null>(
    token,
    '/realname/asign-account/re-auth-user',
    payload,
    '用户重新认证失败',
  )
}
