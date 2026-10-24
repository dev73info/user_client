/**
 * 需求单域接口。
 *
 * 拆成 list（我的需求、详情、工作台大厅取单）、overview（概览与公开精选）、
 * lifecycle（发布 / 评论 / 结束开发 / 催告 / 重新提交 / 取消）、resource（交付资源转为我的资源、
 * 可见性、删除审核）、subscription（状态变更订阅）与共用的 types；
 * 本文件只做汇总导出，调用方仍然 `import ... from '@/api/requirements'`。
 */
export type {
  CommentRequirementPayload,
  CreateRequirementPayload,
  PublicRequirementSpotlightItem,
  PublicRequirementSpotlightPage,
  RecentDeal,
  RequirementItem,
  RequirementOverviewResp,
  RequirementPaymentMode,
  RequirementPendingResourceVersionDeleteRequest,
  RequirementResourceVisibility,
  RequirementStatus,
  ReviewRequirementResourceDeletePayload,
  UpdateRequirementResourceVisibilityPayload,
  UpdateRequirementSubscriptionPayload,
} from './types'

export { fetchRequirementDetail, getWorkbenchRequirementHallItem, listRequirements } from './list'

export {
  getPublicRequirementOverview,
  getRequirementOverview,
  listPublicRequirementSpotlights,
} from './overview'

export {
  cancelRequirement,
  commentRequirement,
  createRequirement,
  requestRequirementFinalPayCure,
  requestRequirementFinalPayment,
  resubmitRequirement,
} from './lifecycle'

export {
  claimRequirementResource,
  reviewRequirementResourceDelete,
  updateRequirementResourceVisibility,
} from './resource'

export { updateRequirementSubscription } from './subscription'
export {
  listRequirementAcceptances,
  submitRequirementAcceptance,
  type RequirementAcceptancePayload,
  type RequirementAcceptanceHistoryItem,
  type RequirementAcceptanceList,
  type RequirementAcceptanceResult,
} from './acceptance'
