import { authHeaders, requestJson } from '@/api/http'

/** 爱签账户管理接口统一响应。 */
export type AsignAccountResponse<T = unknown> = {
  success: boolean
  data?: T | null
}

export type SendVerifyCodePayload = { mobile: string }

export type ModifyMobileByCodePayload = { mobile: string; code: string; ctoken: string }

export type ModifyCompanyInfoPayload = {
  companyName?: string
  name?: string
  idCard?: string
  idCardType?: number
}

/**
 * 修改爱签签署侧登记的姓名。
 *
 * 核验方式与凭证由后端补齐（缺省按「运营商三要素 + 实名手机号」），
 * 用户端不再自选三要素/四要素，所以这三个字段都是可选的。
 */
export type ModifyUserNamePayload = {
  name: string
  identifyType?: number
  mobile?: string
  bankCard?: string
}

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

/**
 * 发验证码。响应 `data` 是 **`codeToken` 字符串本身**（1.x 就是这个形状），
 * 不是 `{ codeToken }` 对象。
 */
export async function sendVerifyCode(token: string, payload: SendVerifyCodePayload) {
  return post<string>(
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

/** 当前主体在爱签的企业印章。 */
export type MySealItem = {
  sealNo?: string
  sealName?: string
  /** 爱签侧生成的印章预览图地址。 */
  sealUrl?: string
  isDefault: boolean
}

/** 企业印章查询结果。 */
export type MySealsData = {
  /** 当前主体在爱签的企业账号（企业为统一社会信用代码）。 */
  account: string
  defaultSealNo?: string
  seals: MySealItem[]
  /** 列表为空时的说明（尚未建主体 / 尚未制章）。 */
  message?: string
}

/** 查询当前主体在爱签的企业印章（只读，不创建也不修改印章）。 */
export async function getMySeals(token: string) {
  return requestJson<AsignAccountResponse<MySealsData>>(
    '/realname/asign-account/seals',
    { method: 'GET', headers: authHeaders(token) },
    '查询企业印章失败',
  )
}

/**
 * 生成爱签「在线制作印章」链接。
 *
 * 只生成链接，不动印章：用户在爱签页面完成制章后才真正产生印章。
 * 不传 `sealNo` 时为新增印章，不会覆盖企业现有印章。
 */
export async function createSealMakeOnline(token: string, payload: { sealNo?: string } = {}) {
  return post<string>(token, '/realname/asign-account/seal-make-online', payload, '生成制章链接失败')
}

