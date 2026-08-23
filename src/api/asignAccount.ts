import { authHeaders, requestJson } from '@/api/http'

/** 爱签账户管理接口统一响应。 */
export type AsignAccountResponse<T = unknown> = {
  success: boolean
  data?: T | null
}

export type SendVerifyCodePayload = { mobile: string }

export type ModifyMobileByCodePayload = { mobile: string; code: string; ctoken: string }

export type ModifyMobileThreePayload = { name: string; idCard: string; mobile: string }

export type ModifySignPasswordPayload = { oldSignPwd: string; signPwd: string }

export type StartModSignPasswordPayload = { isNotice?: number; isShowResult?: number }

export type ResetSignPasswordPayload = { signPwd: string }

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

export async function modifySignPassword(token: string, payload: ModifySignPasswordPayload) {
  return post<void>(
    token,
    '/realname/asign-account/modify-sign-password',
    payload,
    '修改签约密码失败',
  )
}

export async function startModSignPassword(token: string, payload: StartModSignPasswordPayload) {
  return post<{ mobile?: string; account?: string; signUrl?: string; partnerId?: number }>(
    token,
    '/realname/asign-account/start-mod-sign-password',
    payload,
    '初始化签约密码失败',
  )
}

export async function resetSignPassword(token: string, payload: ResetSignPasswordPayload) {
  return post<void>(
    token,
    '/realname/asign-account/reset-sign-password',
    payload,
    '重置签约密码失败',
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
