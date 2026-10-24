import { describe, expect, it } from 'vitest'

import {
  canCancel,
  canComment,
  canOpenAcceptance,
  canOpenAfterSales,
  canPay,
  canReportBreach,
  canRequestFinalPayment,
  canResubmit,
  cancelConfirmHint,
  formatBudget,
  formatCommentSummary,
  formatRequirementDisplayStatus,
  formatRequirementTime,
  hasBoundResource,
  isAdapayRequirement,
  isRequirementContractSigned,
  isSelfManagedRequirement,
  lockRemainingText,
  nextResourceVisibility,
  pendingVersionRejectNote,
  publishedVersionCount,
  settlementHint,
  statusBadgeClass,
} from '@/shared/requirementRowRules'
import { AWAITING_B, NO_CONTRACT, SIGNED, facts, requirement, version } from './helpers/requirementRowFixtures'

/* 这个视图没有挂载测试，行内判定只有这一层网：合同 / 版本两种事实下的各判定取值、
   时间与金额的格式化边界。主操作与「更多」菜单的分组见 requirementRowActions.spec.ts。 */

describe('行内判定：支付模式与资源绑定', () => {
  it('支付模式两档互斥', () => {
    expect(isSelfManagedRequirement(requirement({ payment_mode: 'self_managed' }))).toBe(true)
    expect(isAdapayRequirement(requirement({ payment_mode: 'self_managed' }))).toBe(false)
    expect(isAdapayRequirement(requirement({ payment_mode: 'platform_guarantee' }))).toBe(true)
  })

  it('绑定资源只看 bound_resource_id 是否有值', () => {
    expect(hasBoundResource(requirement({ bound_resource_id: 48 }))).toBe(true)
    expect(hasBoundResource(requirement({ bound_resource_id: null }))).toBe(false)
    expect(hasBoundResource(requirement({ bound_resource_id: undefined }))).toBe(false)
  })
})

describe('行内判定：合同状态', () => {
  it('双方签完才算已签；无合同 / 只有一方签都不算', () => {
    expect(isRequirementContractSigned(facts({ contract: SIGNED }))).toBe(true)
    expect(isRequirementContractSigned(facts({ contract: AWAITING_B }))).toBe(false)
    expect(isRequirementContractSigned(facts({ contract: NO_CONTRACT }))).toBe(false)
    expect(isRequirementContractSigned(facts({ contract: null }))).toBe(false)
  })

  it('担保需求未签约不能支付、不能验收', () => {
    const item = requirement({ status: 'pending_deposit' })
    expect(canPay(item, facts({ contract: SIGNED }))).toBe(true)
    expect(canPay(item, facts({ contract: AWAITING_B }))).toBe(false)
    expect(canPay(item, facts({ contract: null }))).toBe(false)

    const developing = requirement({ status: 'in_development' })
    const factsWithVersions = facts({ contract: SIGNED, versions: [version('v1.0.0')] })
    expect(canOpenAcceptance(developing, factsWithVersions)).toBe(true)
    expect(
      canOpenAcceptance(developing, facts({ contract: AWAITING_B, versions: [version('v1')] })),
    ).toBe(false)
  })

  it('无担保模式不看合同：不能支付，但开发中可以直接确认完成', () => {
    const selfManaged = requirement({ payment_mode: 'self_managed', status: 'in_development' })
    expect(canPay(requirement({ payment_mode: 'self_managed' }), facts({ contract: SIGNED }))).toBe(
      false,
    )
    expect(
      canRequestFinalPayment(selfManaged, facts({ contract: null, versions: [version('v1')] })),
    ).toBe(true)
  })

  it('尾款 / 验收要求至少发布过一个版本', () => {
    const item = requirement({ status: 'in_development' })
    expect(canOpenAcceptance(item, facts({ contract: SIGNED, versions: [] }))).toBe(false)
    expect(canRequestFinalPayment(item, facts({ contract: SIGNED, versions: [] }))).toBe(false)
    expect(
      canRequestFinalPayment(item, facts({ contract: SIGNED, versions: [version('v1')] })),
    ).toBe(true)
  })
})

describe('交付版本：查到列表用列表长度，没查到才回退需求单计数', () => {
  it('versions 为 undefined 时回退 bound_resource_version_count', () => {
    expect(publishedVersionCount(requirement({ bound_resource_version_count: 3 }), facts())).toBe(3)
    expect(
      publishedVersionCount(requirement({ bound_resource_version_count: null }), facts()),
    ).toBe(0)
  })

  it('查到空列表就是 0 版，不回退', () => {
    expect(
      publishedVersionCount(
        requirement({ bound_resource_version_count: 3 }),
        facts({ versions: [] }),
      ),
    ).toBe(0)
    expect(
      publishedVersionCount(
        requirement(),
        facts({ versions: [version('v2.0.0', 2), version('v1.0.0', 1)] }),
      ),
    ).toBe(2)
  })
})

describe('行内判定：取消 / 改稿 / 解除合作', () => {
  it('已缴定金与未接单的可取消状态允许取消', () => {
    expect(canCancel(requirement({ status: 'deposit_paid' }))).toBe(true)
    const unbound = { bound_resource_id: null }
    expect(canCancel(requirement({ status: 'pending_review', ...unbound }))).toBe(true)
    expect(canCancel(requirement({ status: 'rejected', ...unbound }))).toBe(true)
    expect(canCancel(requirement({ status: 'pending_deposit', ...unbound }))).toBe(true)
    // 已绑资源就不再给取消（后端会 409）
    expect(canCancel(requirement({ status: 'pending_review', bound_resource_id: 48 }))).toBe(false)
    expect(canCancel(requirement({ status: 'in_development' }))).toBe(false)
    expect(canCancel(requirement({ status: 'completed' }))).toBe(false)
  })

  it('取消确认文案按「是否退还托管定金」分两句', () => {
    expect(cancelConfirmHint(requirement({ status: 'deposit_paid' }))).toContain('全额原路退还')
    expect(
      cancelConfirmHint(requirement({ status: 'deposit_paid', payment_mode: 'self_managed' })),
    ).toBe('取消后该需求单保留为「已取消」，可以重新编辑后再提交审核。')
  })

  it('被驳回 / 已取消都能改完再提，其余不能', () => {
    expect(canResubmit('rejected')).toBe(true)
    expect(canResubmit('cancelled')).toBe(true)
    expect(canResubmit('pending_review')).toBe(false)
    expect(canResubmit('completed')).toBe(false)
  })

  it('担保需求在待接单之后的各档都能申报解除合作，无担保模式一律没有', () => {
    for (const status of [
      'deposit_paid',
      'in_development',
      'pending_final',
      'pending_settlement',
    ] as const) {
      expect(canReportBreach(requirement({ status }), facts()), status).toBe(true)
      expect(
        canReportBreach(requirement({ status, payment_mode: 'self_managed' }), facts()),
        status,
      ).toBe(false)
    }
    // 待接单要看过合同：没签合同的入口不给（BUG-038）
    expect(
      canReportBreach(requirement({ status: 'pending_deposit' }), facts({ contract: SIGNED })),
    ).toBe(true)
    expect(
      canReportBreach(requirement({ status: 'pending_deposit' }), facts({ contract: AWAITING_B })),
    ).toBe(false)
  })

  it('解除合作与评价只认已结单', () => {
    expect(canOpenAfterSales(requirement({ status: 'completed' }))).toBe(true)
    expect(canOpenAfterSales(requirement({ status: 'pending_settlement' }))).toBe(false)
    expect(
      canOpenAfterSales(requirement({ status: 'completed', payment_mode: 'self_managed' })),
    ).toBe(false)
    expect(canComment('completed')).toBe(true)
    expect(canComment('pending_final')).toBe(false)
  })

  it('待分账才有分账提示', () => {
    expect(settlementHint(requirement({ status: 'pending_settlement' }))).toContain('渠道分账中')
    expect(settlementHint(requirement({ status: 'completed' }))).toBe('')
  })
})

describe('行内展示：状态、时间与金额', () => {
  it('担保需求「待付定金」按事实拆成三句', () => {
    const noResource = requirement({ bound_resource_id: null })
    expect(formatRequirementDisplayStatus(noResource, facts())).toBe('待开发者接单')
    expect(formatRequirementDisplayStatus(requirement(), facts({ contract: AWAITING_B }))).toBe(
      '待签合同',
    )
    expect(formatRequirementDisplayStatus(requirement(), facts({ contract: SIGNED }))).toBe(
      '待付定金',
    )
  })

  it('状态徽标按语义分四档', () => {
    expect(statusBadgeClass(requirement({ status: 'completed' }), facts())).toBe(
      'wb-badge--success',
    )
    expect(statusBadgeClass(requirement({ status: 'rejected' }), facts())).toBe('wb-badge--danger')
    expect(statusBadgeClass(requirement({ status: 'cancelled' }), facts())).toBe('wb-badge--danger')
    expect(statusBadgeClass(requirement({ status: 'in_development' }), facts())).toBe(
      'wb-badge--accent',
    )
    // 待签合同压过状态本身的档位
    expect(statusBadgeClass(requirement(), facts({ contract: AWAITING_B }))).toBe(
      'wb-badge--warning',
    )
  })

  it('时间格式化：非法时间给「刚刚更新」，正常值带月日与时', () => {
    expect(formatRequirementTime('不是时间')).toBe('刚刚更新')
    expect(formatRequirementTime('')).toBe('刚刚更新')
    const text = formatRequirementTime('2026-10-09 10:00:00')
    expect(text).toContain('10/9')
    expect(text).toContain('10:00')
  })

  it('预算：空值给「待议价」，其余固定两位小数', () => {
    expect(formatBudget(null)).toBe('待议价')
    expect(formatBudget(undefined)).toBe('待议价')
    expect(formatBudget(0)).toBe('¥0.00')
    expect(formatBudget(1200.5)).toBe('¥1200.50')
    expect(formatBudget(999)).toBe('¥999.00')
  })

  it('评价摘要：脏数据（纯数字 / 过短）只显示分数', () => {
    expect(formatCommentSummary(5)).toBe('5.0 分')
    expect(formatCommentSummary(4.5, '   ')).toBe('4.5 分')
    expect(formatCommentSummary(4.5, '5')).toBe('4.5 分')
    expect(formatCommentSummary(4.5, '4.5')).toBe('4.5 分')
    expect(formatCommentSummary(4.5, '好')).toBe('4.5 分')
    expect(formatCommentSummary(4.5, '交付很利索')).toBe('4.5 分 · 交付很利索')
  })

  it('锁定剩余天数文案：未锁定为空串', () => {
    expect(lockRemainingText(requirement())).toBe('')
  })
})

describe('资源可见性与版本删除草稿', () => {
  it('私有→公开，公开 / 审核中→私有', () => {
    expect(nextResourceVisibility(requirement({ resource_visibility: 'private' }))).toBe('public')
    expect(nextResourceVisibility(requirement({ resource_visibility: 'public' }))).toBe('private')
    expect(nextResourceVisibility(requirement({ resource_visibility: 'review' }))).toBe('private')
    expect(nextResourceVisibility(requirement({ resource_visibility: null }))).toBe('private')
  })

  it('拒绝原因草稿按版本 id 取，没写过就是空串', () => {
    const request = { version_id: 7, version: 'v1.0.0', requested_at: '2026-10-09 10:00:00' }
    expect(pendingVersionRejectNote({}, request)).toBe('')
    expect(pendingVersionRejectNote({ 7: '版本有问题' }, request)).toBe('版本有问题')
  })
})
