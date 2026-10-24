/**
 * 合同签署页的**回跳上下文**（R047 从 `ContractSignView` 迁出）。
 *
 * 爱签走的是**整页跳转**：去签署、去预览都会离开本站，回来时 query 已经丢了。
 * 三条上下文因此落在 `sessionStorage` 里，页面重新挂载后仍然知道「从哪来、回哪去、
 * 是不是刚从爱签签完回来」。这些键与读写都是纯逻辑，放在 shared 里便于单测。
 */

/** 入驻协议签署完成后回到来源页的会话键。 */
export const DEVELOPER_AGREEMENT_REDIRECT_KEY = '73info_developer_agreement_redirect'
/** 接口使用协议签署完成后回到来源页的会话键。 */
export const API_USAGE_AGREEMENT_REDIRECT_KEY = '73info_api_usage_agreement_redirect'
/** 需求合同：记住从哪进来的（`from=user|dev`），爱签整页回跳后 query 会丢。 */
export const REQUIREMENT_SIGN_FROM_KEY = '73info_requirement_sign_from'
/**
 * 用户点了「去爱签签署」之后置位：回跳并同步到「已签约」时自动离开签署页，
 * 避免爱签 redirectUrl 又落回同一页（签署后又跳转到原地）。
 * 主动打开已签合同详情时不置位，不会被误踢走。
 */
export const REQUIREMENT_SIGN_PENDING_RETURN_KEY = '73info_requirement_sign_pending_return'

/** 只接受站内绝对路径（`/` 开头且不是 `//`），其余一律视为没有目标。 */
export function normalizeRedirectTarget(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) {
    return ''
  }
  return raw
}

export function readSessionValue(key: string): string {
  if (typeof window === 'undefined') {
    return ''
  }
  try {
    return window.sessionStorage.getItem(key)?.trim() ?? ''
  } catch {
    return ''
  }
}

export function writeSessionValue(key: string, value: string) {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.sessionStorage.setItem(key, value)
  } catch {
    // sessionStorage 不可用时仍可依赖当前路由参数。
  }
}

export function clearSessionValue(key: string) {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.sessionStorage.removeItem(key)
  } catch {
    // sessionStorage 不可用时忽略清理。
  }
}

/** 平台协议按类型各用一个回跳键：开发者入驻与接口使用互不覆盖。 */
export function agreementRedirectKey(isApiUsageAgreement: boolean): string {
  return isApiUsageAgreement ? API_USAGE_AGREEMENT_REDIRECT_KEY : DEVELOPER_AGREEMENT_REDIRECT_KEY
}

/** 从 query 里取「来源」，只认 `user` / `dev`。 */
export function requirementSignFrom(value: unknown): string {
  const from = typeof value === 'string' ? value.trim() : ''
  return from === 'user' || from === 'dev' ? from : ''
}

/**
 * 需求合同签署完成（或从爱签回来）后该回哪：站内路径优先，其次按来源路由名，
 * 最后落在「我的需求」。
 */
export function requirementSignReturnTarget(input: {
  /** query 里的 `redirect_to` */
  queryRedirectTo: unknown
  /** 已记下的回跳目标（query 优先、其次 session） */
  rememberedRedirect: string
  /** query 里的 `from` */
  queryFrom: unknown
  /** session 里记下的 `from` */
  sessionFrom: string
  /** 当前是不是工作台的签署详情入口 */
  isWorkbenchSignature: boolean
}): string | { name: string } {
  const remembered = normalizeRedirectTarget(input.queryRedirectTo) || input.rememberedRedirect
  if (remembered) {
    return remembered
  }
  const from = requirementSignFrom(input.queryFrom) || input.sessionFrom
  if (from === 'dev') {
    return { name: 'dev-my-requirements' }
  }
  if (from === 'user') {
    return { name: 'workbench-requirements' }
  }
  if (input.isWorkbenchSignature) {
    return { name: 'workbench-signatures' }
  }
  return { name: 'workbench-requirements' }
}
