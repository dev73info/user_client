/**
 * 设置域接口。
 *
 * 按用途拆成 profile（资料与背景）、security（邮箱 / 密码 / 两步验证）、
 * subscriptions（订阅开关）、misc（活动领取、定金比例）与共用的 types；
 * 本文件只做汇总导出，调用方仍然 `import ... from '@/api/settings'`。
 */
export type {
  ActivityCampaignClaimResp,
  DepositRatioResp,
  ProfileResponse,
  ProfileSubscriptionsResp,
  SubscriptionResponse,
  UpdateProfileRequest,
  UpdateSubscriptionsRequest,
} from './types'

export {
  getProfile,
  updateProfile,
  updateProfileBackgroundDynamic,
  updateProfileBackgroundStatic,
  uploadProfileAvatar,
  uploadProfileBackground,
  uploadProfileBackgroundDynamic,
} from './profile'

export {
  sendProfileEmailChangeCode,
  sendProfilePasswordCode,
  sendProfileTwoFactorCode,
  updateProfileEmail,
  updateProfilePassword,
  updateProfileTwoFactor,
} from './security'

export { getProfileSubscriptions, updateProfileSubscriptions } from './subscriptions'
export { claimActivityCampaign, getDepositRatio } from './misc'
