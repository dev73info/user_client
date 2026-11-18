/**
 * 登录与第三方账号域接口。
 *
 * 拆成 oauth（登录方式、绑定与解绑、注销）、wechat / thirdPartyLogin（PC 扫码登录）、
 * agreements（协议正文）、devAccess（开发者资格与生效权限）、authClient（登录 / 注册 / 令牌那一组）
 * 与共用的 types；本文件只做汇总导出，调用方仍然 `import ... from '@/api/auth'`。
 */
export type {
  AgreementAcceptancePayload,
  AuthPayload,
  AuthRequestPayload,
  GithubAuthUrlResp,
  GiteeAuthUrlResp,
} from '@/shared/auth/client'
export { detectClientPlatform, isTwoFactorRequiredPayload } from '@/shared/auth/client'

export type {
  AccountCloseRequestResp,
  AuthorizeUrlResp,
  BoundProvidersResp,
  DevAccessStatus,
  OAuthProvider,
  OauthStatusResp,
  PrivilegesResponse,
  ProviderUnbindQrStatusResp,
  ProviderUnbindQrUrlResp,
  UserServiceAgreement,
  WechatBindQrStatusResp,
  WechatBindQrUrlResp,
  WechatLoginQrPollStatus,
  WechatLoginQrStatusResp,
  WechatLoginQrUrlResp,
  WechatMpLoginQrUrlResp,
} from './types'

export {
  cancelAccountClose,
  getBoundProviders,
  getOauthStatus,
  getAccountCloseRequest,
  getProviderBindUrl,
  getProviderUnbindUrl,
  requestAccountClose,
  sendAccountCloseCode,
} from './oauth'

export {
  getWechatBindQrStatus,
  getWechatBindQrUrl,
  getWechatLoginQrStatus,
  getWechatLoginQrUrl,
  getWechatLoginUrl,
  getWechatMpLoginQrStatus,
  getWechatMpLoginQrUrl,
  getWechatUnbindQrStatus,
  getWechatUnbindQrUrl,
} from './wechat'

export {
  getQqLoginQrStatus,
  getQqLoginQrUrl,
  getQqLoginUrl,
  getQqUnbindQrStatus,
  getQqUnbindQrUrl,
} from './thirdPartyLogin'

export { fetchAgreementContent, fetchUserServiceAgreement } from './agreements'
export { getDevAccessStatus, getPrivileges, requestDevRole } from './devAccess'

export {
  authRequest,
  getGiteeAuthorizeUrl,
  getGithubAuthorizeUrl,
  loginWithAuthenticator,
  recordAgreementAcceptance,
  refreshSession,
  refreshToken,
  resetPassword,
  sendRegisterEmailCode,
  sendResetPasswordEmailCode,
} from './authClient'
