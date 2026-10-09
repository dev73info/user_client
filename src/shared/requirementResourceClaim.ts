import type { RequirementItem } from '@/api/requirements'
import { HttpError } from '@/shared/api/httpClient'

/**
 * 「转为我的资源」的展示与错误口径。
 *
 * 只收「我的需求」卡片要用的几个纯判定：入口显示条件与后端前置一致
 * （`completed` + 有交付资源 + 未转换），错误文案按状态码分档。
 * 放在 shared 里是为了能单测，页面只做调用。
 */

type ClaimableRequirement = Pick<RequirementItem, 'status' | 'bound_resource_id' | 'resource_claimed_at'>

/** 已转为需求方资源：`resource_claimed_at` 有值即算，不看其它字段。 */
export function isRequirementResourceClaimed(item: ClaimableRequirement): boolean {
  return typeof item.resource_claimed_at === 'string' && item.resource_claimed_at.length > 0
}

/**
 * 能否展示「转为我的资源」入口：已结单（`completed`）、绑定了交付资源、尚未转换。
 *
 * `pending_settlement`（尾款已缴待分账）后端也算未结单，这里同样不显示——否则点了必 409。
 */
export function canClaimRequirementResource(item: ClaimableRequirement): boolean {
  return (
    item.status === 'completed' &&
    item.bound_resource_id != null &&
    !isRequirementResourceClaimed(item)
  )
}

export type ClaimResourceFailure = {
  /** 直接给 toast 的中文文案。 */
  message: string
  /** 后端说「已转换」：调用方只需刷新列表并按已转换展示，不必再报错。 */
  alreadyClaimed: boolean
}

/** 后端 409「已转换」的原文，用于识别重复提交；文案变动时只改这里。 */
const ALREADY_CLAIMED_HINT = '已转为需求方资源'

/**
 * 把转换接口的失败翻译成可读文案。
 *
 * 后端错误体是 text/plain，409 的几种前置（未结单 / 已转换 / 无交付资源 / 团队资源 / 有未结案件）
 * 本身就是中文句子，原样展示即可；403 / 404 的英文 body 换成中文。其余状态码优先用后端文案，没有就兜底。
 */
export function describeClaimResourceError(
  error: unknown,
  fallback = '转为我的资源失败',
): ClaimResourceFailure {
  if (error instanceof HttpError) {
    const body = error.message.trim()
    if (error.status === 403) {
      return { message: '只有需求创建者本人可以转换该资源', alreadyClaimed: false }
    }
    if (error.status === 404) {
      return { message: '需求不存在或已被删除', alreadyClaimed: false }
    }
    if (error.status === 409) {
      return {
        message: body || '当前状态不允许转换',
        alreadyClaimed: body.includes(ALREADY_CLAIMED_HINT),
      }
    }
    return { message: body || fallback, alreadyClaimed: false }
  }
  if (error instanceof Error && error.message.trim()) {
    return { message: error.message, alreadyClaimed: false }
  }
  return { message: fallback, alreadyClaimed: false }
}
