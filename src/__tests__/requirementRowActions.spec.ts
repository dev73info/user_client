import { describe, expect, it } from 'vitest'

import type { RequirementItem } from '@/api/requirements'
import type { PublicMcResourceVersionItem } from '@/api/resources'
import type { ContractSigningStatus } from '@/shared/contracts'
import { moreRowActions, primaryRowAction, rowContractAction } from '@/shared/requirementRowActions'
import type { RequirementRowFacts } from '@/shared/requirementRowRules'

/* 行内操作区的分组：唯一主操作的优先级、以及「更多」菜单里到底有哪些项。
   判定本身在 requirementRowRules.spec.ts 里按事实取值断言，这里只看位置与顺序。 */

const SIGNED: ContractSigningStatus = {
  has_contract: true,
  party_a_signed: true,
  party_b_signed: true,
}
// party_a 是需求方（本页用户）：a 没签、b 签过时，入口是「签署合同」
const WAITING_A: ContractSigningStatus = {
  has_contract: true,
  party_a_signed: false,
  party_b_signed: true,
}
const NO_CONTRACT: ContractSigningStatus = {
  has_contract: false,
  party_a_signed: false,
  party_b_signed: false,
}

function version(no: string, id = 1): PublicMcResourceVersionItem {
  return {
    id,
    resource_id: 48,
    version: no,
    resource: `https://cdn.example.com/${no}.zip`,
    note: null,
    creator: 'dev',
    created_at: '2026-10-09 10:00:00',
    is_current: true,
    price_fen: 0,
    purchasable: false,
  }
}

function requirement(part: Partial<RequirementItem> = {}): RequirementItem {
  return {
    id: 1,
    requirement_id: '2026-1',
    created_time: '2026-10-09 10:00:00',
    creator: 'customer',
    subscribe_status_change: false,
    title: '需求单',
    payment_mode: 'platform_guarantee',
    status: 'pending_deposit',
    bound_resource_id: 48,
    ...part,
  }
}

function facts(part: Partial<RequirementRowFacts> = {}): RequirementRowFacts {
  return { contract: null, ...part }
}

describe('主操作优先级', () => {
  it('合同入口优先于改稿与付款：无合同→发起中 / 发起合同', () => {
    const item = requirement({ status: 'pending_deposit' })
    expect(primaryRowAction(item, facts({ contract: NO_CONTRACT }))).toEqual({
      key: 'contract-create',
      label: '发起合同',
      disabled: false,
    })
    expect(
      primaryRowAction(item, facts({ contract: NO_CONTRACT }), { contractCreating: true }),
    ).toEqual({ key: 'contract-create', label: '发起中...', disabled: true })
    expect(primaryRowAction(item, facts({ contract: WAITING_A }))).toEqual({
      key: 'contract-sign',
      label: '签署合同',
    })
    // 我方已签：合同入口降级到「更多」，主操作让位给付款
    expect(rowContractAction(item, facts({ contract: SIGNED }))).toBe('view')
    expect(primaryRowAction(item, facts({ contract: SIGNED }))).toEqual({
      key: 'pay',
      label: '支付定金',
    })
  })

  it('驳回 / 已取消先给「编辑」，盖过支付与评价', () => {
    const rejected = requirement({ status: 'rejected' })
    expect(primaryRowAction(rejected, facts({ contract: NO_CONTRACT }))?.key).toBe('resubmit')
  })

  it('待付尾款给「支付尾款」，可取消时不给主操作', () => {
    const final = requirement({ status: 'pending_final', bound_resource_id: 48 })
    expect(primaryRowAction(final, facts({ contract: SIGNED }))).toEqual({
      key: 'pay',
      label: '支付尾款',
    })
    // 已缴定金这一档可以取消，取消与支付互斥 → 没有主操作
    expect(
      primaryRowAction(requirement({ status: 'deposit_paid' }), facts({ contract: SIGNED })),
    ).toBe(null)
  })

  it('验收优先于无担保的「确认完成」', () => {
    const developing = requirement({ status: 'in_development' })
    expect(
      primaryRowAction(developing, facts({ contract: SIGNED, versions: [version('v1')] }))?.key,
    ).toBe('acceptance')
    expect(
      primaryRowAction(requirement({ status: 'in_development', payment_mode: 'self_managed' }), {
        contract: null,
        versions: [version('v1')],
      }),
    ).toEqual({ key: 'finish', label: '确认完成' })
  })

  it('已结单未评价给「去评价」，评过就没有主操作', () => {
    const completed = requirement({ status: 'completed' })
    expect(primaryRowAction(completed, facts({ contract: SIGNED }))?.key).toBe('comment')
    expect(primaryRowAction(requirement({ status: 'completed', comment_rating: 5 }), facts())).toBe(
      null,
    )
  })
})

describe('「更多」菜单项集合', () => {
  it('合同已签给「查看合同」，绑定资源给「资源主页」，发票恒有一项', () => {
    const item = requirement({ status: 'in_development' })
    const keys = moreRowActions(item, facts({ contract: SIGNED })).map((entry) => entry.key)
    // 开发中还能申报解除合作（唯一的退出入口），结单后才换成「解除合作」按钮
    expect(keys).toEqual(['contract-view', 'homepage', 'invoice', 'breach'])
  })

  it('已评价的行保留「修改评价」，未评价的行不放', () => {
    const rated = requirement({ status: 'completed', comment_rating: 5 })
    expect(moreRowActions(rated, facts()).map((entry) => entry.key)).toContain('comment')
    const unrated = requirement({ status: 'completed' })
    expect(moreRowActions(unrated, facts()).map((entry) => entry.key)).not.toContain('comment')
  })

  it('开不出票时置灰并带原因，可点时不带 disabled', () => {
    const selfManaged = requirement({ payment_mode: 'self_managed' })
    const disabled = moreRowActions(selfManaged, facts()).find((entry) => entry.key === 'invoice')
    expect(disabled).toEqual({
      key: 'invoice',
      label: '获取发票',
      disabled: true,
      title: '无担保模式不涉及付款与开票',
    })
    const enabled = moreRowActions(requirement(), facts()).find((entry) => entry.key === 'invoice')
    expect(enabled).toEqual({ key: 'invoice', label: '获取发票' })
  })

  it('解除合作与取消需求都是危险项，且跟着判定走', () => {
    const depositPaid = requirement({ status: 'deposit_paid' })
    const entries = moreRowActions(depositPaid, facts({ contract: SIGNED }))
    expect(entries).toContainEqual({ key: 'cancel', label: '取消需求', danger: true })
    expect(entries).toContainEqual({ key: 'breach', label: '解除合作', danger: true })
    // 已结单：两条都消失
    const completed = moreRowActions(
      requirement({ status: 'completed' }),
      facts({ contract: SIGNED }),
    )
    expect(completed.map((entry) => entry.key)).not.toContain('cancel')
    expect(completed.map((entry) => entry.key)).not.toContain('breach')
  })
})
