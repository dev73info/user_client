/** 回调验签口径，页面提示与开发者文档必须一字不差。 */
export const API_CALLBACK_SIGNATURE_RULE = 'HMAC-SHA256(secret, "{timestamp}.{raw_body}")'

/** 开放下单接口路径（2.0 正式名；`api-purchase` 只是兼容别名）。 */
export const API_OPEN_PURCHASE_PATH = '/api/resource/open/purchases'

/** 下单接口的兼容别名（legacy 客户端仍在用，提示词里只作备注）。 */
export const API_OPEN_PURCHASE_ALIAS_PATH = '/api/resource/open/api-purchase'

/** 建立外部用户与平台账号的映射。 */
export const API_OPEN_USERS_ENSURE_PATH = '/api/resource/open/users/ensure'

/** 按订单号对账（后面拼 `/{order_no}`）。 */
export const API_OPEN_ORDER_PATH = '/api/resource/open/orders'

/** 一次性票据换平台登录态。 */
export const API_OPEN_CHECKOUT_EXCHANGE_PATH = '/api/resource/checkout/exchange'

/** 接入指导文档路径：后端公开读，返回 markdown。 */
export const API_INTEGRATION_GUIDE_PATH = '/api/resource/open/integration-guide'

/**
 * 接入凭据的展示形态。2.0 只认 `Authorization` 头里的两套凭据（Basic 客户端凭据 / Bearer 用户令牌），
 * **不再有 `X-Api-Key`**；`client_secret` 在「开发者 → 接入客户端」创建时只显示一次，
 * 所以提示词里只给占位符，不编一个假密钥。
 */
export const API_CREDENTIALS_PLACEHOLDER =
  'client_id:client_secret（在「开发者 → 接入客户端」创建，只显示一次）'

/**
 * 接入提示词：开发者复制给 AI 编码代理，由代理照指导文档在自己站点的**服务端**完成接入。
 *
 * 提示词只组装三件事——接入凭据、接入地址、指导文档地址；资源编号未知时用占位符，
 * 不要让开发者抄到一条假编号。
 *
 * 文案与后端 `crates/business/resource_purchase/open-api-guide.md` 是**同一份 2.0 契约**：
 * 凭据只认 `Authorization` 头（`X-Api-Key` 已取消）、下单返回 `checkout_url` 且票据 10 分钟一次性、
 * 回调要按原始请求体验签且不能当作唯一入账依据。改这里就要同步那份 guide。
 */
export function buildApiIntegrationPrompt(
  resourceId: number | null | undefined,
  options: { apiBase?: string } = {},
): string {
  const apiBase = (options.apiBase ?? '').trim().replace(/\/$/, '') || 'https://api.73info.cn'
  const id =
    Number.isInteger(resourceId) && Number(resourceId) > 0 ? String(resourceId) : '{你的资源编号}'

  return [
    '你是我的服务端开发助手。请先读接入指导文档，再按它在我自有站点的服务端完成接口资源接入。',
    '',
    `- 指导文档：${apiBase}${API_INTEGRATION_GUIDE_PATH}`,
    `- 接入凭据：${API_CREDENTIALS_PLACEHOLDER}`,
    '- 鉴权方式：请求头 Authorization；服务端到服务端用 Basic base64(client_id:client_secret)，用户身份用 Bearer <OAuth access token>。不再使用 X-Api-Key',
    `- 下单：POST ${apiBase}${API_OPEN_PURCHASE_PATH}（resource_id = ${id}；兼容别名 ${API_OPEN_PURCHASE_ALIAS_PATH}）`,
    `- 建立用户映射：POST ${apiBase}${API_OPEN_USERS_ENSURE_PATH}（外部用户还没注册平台账号时返回 409，2.0 不会自动建号，请先引导用户注册并绑定）`,
    `- 对账：GET ${apiBase}${API_OPEN_ORDER_PATH}/{order_no}`,
    `- 票据换登录态：POST ${apiBase}${API_OPEN_CHECKOUT_EXCHANGE_PATH}`,
    '',
    '凭据只放在服务端，不要写进浏览器、小程序等客户端代码；下单后把返回的 checkout_url 交给买家浏览器打开（票据 10 分钟有效且只能用一次），付款结果由平台回调我配置的回调地址，请按 order_no 幂等处理。',
    `回调请求头带 X-73Info-Order-No / X-73Info-Event / X-73Info-Timestamp / X-73Info-Signature（sha256=<hex>），签名口径是 ${API_CALLBACK_SIGNATURE_RULE}，必须用原始请求体重算；回调重试 5 次，回调失败不影响收款与分账，不要把它当成唯一入账依据。`,
  ].join('\n')
}
