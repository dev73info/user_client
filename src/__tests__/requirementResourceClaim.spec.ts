import { describe, expect, it } from 'vitest'

import { HttpError } from '@/api/http'
import type { RequirementItem } from '@/api/requirements'
import {
  canClaimRequirementResource,
  describeClaimResourceError,
  isRequirementResourceClaimed,
} from '@/shared/requirementResourceClaim'

/* 「转为我的资源」入口只在「已结单 + 有交付资源 + 未转换」时出现，
   这里按状态 × 绑定 × 转换三个维度断言显示条件，再覆盖成功 / 失败分支的错误翻译。 */

function requirement(part: Partial<RequirementItem> = {}): RequirementItem {
  return {
    id: 1,
    requirement_id: '2026-1',
    created_time: '2026-10-09 10:00:00',
    creator: 'customer',
    subscribe_status_change: false,
    title: '需求单',
    payment_mode: 'platform_guarantee',
    status: 'completed',
    bound_resource_id: 48,
    resource_claimed_at: null,
    ...part,
  }
}

describe('转为我的资源：入口显示条件', () => {
  it('已结单、绑定了交付资源、尚未转换时显示入口', () => {
    expect(canClaimRequirementResource(requirement())).toBe(true)
    expect(isRequirementResourceClaimed(requirement())).toBe(false)
  })

  it('不是 completed 的需求一律不显示，待分账也算未结单', () => {
    const statuses: RequirementItem['status'][] = [
      'pending_review',
      'rejected',
      'pending_deposit',
      'deposit_paid',
      'in_development',
      'pending_final',
      'pending_settlement',
      'cancelled',
    ]
    for (const status of statuses) {
      expect(canClaimRequirementResource(requirement({ status })), status).toBe(false)
    }
  })

  it('没有交付资源的已结单需求不显示入口', () => {
    expect(canClaimRequirementResource(requirement({ bound_resource_id: null }))).toBe(false)
    expect(canClaimRequirementResource(requirement({ bound_resource_id: undefined }))).toBe(false)
  })

  it('已转换的需求不再显示按钮，而是按「已转为我的资源」展示', () => {
    const claimed = requirement({ resource_claimed_at: '2026-10-09 11:20:00' })
    expect(canClaimRequirementResource(claimed)).toBe(false)
    expect(isRequirementResourceClaimed(claimed)).toBe(true)
  })

  it('列表接口没带该字段（旧数据 / 旧后端）时视为未转换', () => {
    const legacy = requirement()
    delete legacy.resource_claimed_at
    expect(isRequirementResourceClaimed(legacy)).toBe(false)
    expect(canClaimRequirementResource(legacy)).toBe(true)
    // 空字符串也当未转换，不要把 '' 读成「已转」
    expect(isRequirementResourceClaimed(requirement({ resource_claimed_at: '' }))).toBe(false)
  })
})

describe('转为我的资源：失败分支文案', () => {
  it('409 的几种前置原样展示后端中文文案', () => {
    for (const body of [
      '需求尚未结单，暂不能转为我的资源',
      '该需求没有交付资源，无法转换',
      '团队资源暂不支持转换',
      '该需求存在未结的解除合作或售后案件，请结案后再转换',
    ]) {
      const result = describeClaimResourceError(new HttpError(409, body))
      expect(result.message).toBe(body)
      expect(result.alreadyClaimed).toBe(false)
    }
  })

  it('409「已转换」单独标出来，调用方只需刷新列表而不是报错', () => {
    const result = describeClaimResourceError(new HttpError(409, '该交付资源已转为需求方资源'))
    expect(result.alreadyClaimed).toBe(true)
    expect(result.message).toBe('该交付资源已转为需求方资源')
  })

  it('403 / 404 的英文 body 换成中文', () => {
    expect(describeClaimResourceError(new HttpError(403, 'forbidden')).message).toBe(
      '只有需求创建者本人可以转换该资源',
    )
    expect(describeClaimResourceError(new HttpError(404, 'requirement not found')).message).toBe(
      '需求不存在或已被删除',
    )
  })

  it('500 优先用后端文案，空 body 与非 HttpError 走兜底', () => {
    expect(describeClaimResourceError(new HttpError(500, '数据库连接失败')).message).toBe(
      '数据库连接失败',
    )
    expect(describeClaimResourceError(new HttpError(500, '   ')).message).toBe('转为我的资源失败')
    expect(describeClaimResourceError(new Error('网络异常')).message).toBe('网络异常')
    expect(describeClaimResourceError('oops', '自定义兜底').message).toBe('自定义兜底')
    expect(describeClaimResourceError(undefined).alreadyClaimed).toBe(false)
  })
})
