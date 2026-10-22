/**
 * 登录与第三方账号域接口。
 *
 * 拆成 oauth（登录方式、绑定与解绑、注销）、wechat（微信支付授权 / 绑定 / 扫码登录）、
 * thirdPartyLogin（云闪付授权与 QQ 扫码）、agreements（协议正文）、devAccess（开发者资格）、
 * authClient（登录 / 注册 / 令牌那一组）与共用的 types；
 * 本文件只做汇总导出，调用方仍然 `import ... from '@/api/auth'`。
 */
export type {
  AgreementAcceptancePayload,
  AuthPayload,
  AuthRequestPayload,
  GiteeAuthUrlResp,
  GithubAuthUrlResp,
} from '@/shared/auth/client'
export { detectClientPlatform, isTwoFactorRequiredPayload } from '@/shared/auth/client'

export type {
  AgreementContent,
  BoundProvidersResp,
  DevAccessStatus,
  OAuthProvider,
  OauthStatusResp,
  QqLoginQrStatusResp,
  QqLoginQrUrlResp,
  UnionPaymentAuthorizeUrlResp,
  UserServiceAgreement,
  WechatBindQrStatusResp,
  WechatBindQrUrlResp,
  WechatLoginQrPollStatus,
  WechatLoginQrStatusResp,
  WechatLoginQrUrlResp,
  WechatPaymentAuthorizeUrlResp,
  WechatPaymentAuthorizationStatusResp,
} from './types'

export {
  closeAccount,
  getBoundProviders,
  getOauthStatus,
  getProviderBindUrl,
  unbindProvider,
} from './oauth'

export {
  getWechatBindAuthorizeUrl,
  getWechatBindQrStatus,
  getWechatBindQrUrl,
  getWechatLoginQrStatus,
  getWechatLoginQrUrl,
  getWechatPaymentAuthorizeUrl,
  getWechatPaymentAuthorizationStatus,
  isWechatPaymentAuthorizationRequired,
} from './wechat'

export {
  getQqLoginQrStatus,
  getQqLoginQrUrl,
  getUnionPaymentAuthorizeUrl,
  isUnionPaymentAuthorizationRequired,
} from './thirdPartyLogin'

export { fetchAgreementContent, fetchUserServiceAgreement } from './agreements'
export { getDevAccessStatus, requestDevRole } from './devAccess'

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
