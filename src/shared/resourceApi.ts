/**
 * R028 接口资源：资源类别判定、回调地址与「允许来源」的解析 / 校验、渠道配置完整度的纯函数。
 *
 * 这里只放可单独测试的纯逻辑，不做请求、不碰 DOM——表单页与列表页共用同一份口径，
 * 免得「页面上能填」与「后端能收」两套规则各写一遍。
 *
 * 实现按职责分在 `resourceApi/` 下，此处汇总再导出。
 */

export { ALLOWED_ORIGIN_MAX_LENGTH, CALLBACK_URL_MAX_LENGTH } from './resourceApi/limits'
export {
  isApiResourceKind,
  resourceKindLabel,
  API_RESOURCE_UNAVAILABLE_ACTIONS,
  isResourceRowActionAvailable,
  resourceKindFromQuery,
} from './resourceApi/kind'
export type { McResourceKindLike, ResourceRowAction } from './resourceApi/kind'
export {
  parseAllowedOriginsInput,
  formatAllowedOriginsText,
  isValidAllowedOrigin,
  findInvalidAllowedOrigin,
} from './resourceApi/origin'
export { isValidCallbackUrl, listApiChannelBlockers } from './resourceApi/callback'
export type { ResourceApiChannelLike } from './resourceApi/callback'
export {
  API_CALLBACK_SIGNATURE_RULE,
  API_OPEN_PURCHASE_PATH,
  API_OPEN_PURCHASE_ALIAS_PATH,
  API_OPEN_USERS_ENSURE_PATH,
  API_OPEN_ORDER_PATH,
  API_OPEN_CHECKOUT_EXCHANGE_PATH,
  API_INTEGRATION_GUIDE_PATH,
  API_CREDENTIALS_PLACEHOLDER,
  buildApiIntegrationPrompt,
} from './resourceApi/openApi'
