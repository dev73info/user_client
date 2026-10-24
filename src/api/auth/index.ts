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
  AuthorizeUrlResp,
  BoundProvidersResp,
  DevAccessStatus,
  OAuthProvider,
  OauthStatusResp,
  PrivilegesResponse,
  UserServiceAgreement,
  WechatLoginQrPollStatus,
  WechatLoginQrStatusResp,
  WechatLoginQrUrlResp,
} from './types'

export {
  closeAccount,
  getBoundProviders,
  getOauthStatus,
  getProviderBindUrl,
  unbindProvider,
} from './oauth'

export { getWechatLoginQrStatus, getWechatLoginQrUrl } from './wechat'

export { getQqLoginQrStatus, getQqLoginQrUrl } from './thirdPartyLogin'

export { fetchUserServiceAgreement } from './agreements'
export { getDevAccessStatus, getPrivileges, requestDevRole } from './devAccess'

export {
  authRequest,
  getGiteeAuthorizeUrl,
  getGithubAuthorizeUrl,
  recordAgreementAcceptance,
  refreshToken,
  resetPassword,
  sendRegisterEmailCode,
  sendResetPasswordEmailCode,
} from './authClient'
