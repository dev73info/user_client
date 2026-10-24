import { describe, expect, it } from 'vitest'

import {
  isSettleBound,
  isSettleRejected,
  isSettleUnderReview,
  settleAccountStage,
  settleProviderErrorText,
} from '@/shared/settleAccountStage'

/**
 * 收款账户阶段的判定口径。
 *
 * 事实源是契约 `SettlementAccountResponse` 的两个字段：`status`（后端状态机）与
 * `accepts_settlement`（能不能收分账款，后端判定）。前端不再拿卡号尾数当「结算账户号」用，
 * 所以「绑没绑」只有一个布尔来源。
 *
 * 这几档对应四个真实缺陷，各钉一个：
 * - BUG-013：渠道把开户**驳回**（`failed`）被当成「已开通」，用户端显示「待绑卡」，
 *   引导他去绑一张根本绑不上的卡，还看不到「渠道已拒绝」。
 * - BUG-017：渠道**审核已通过**、只差结算账户没建（`active`）被当成「还在审核」，
 *   账户页永久停在「渠道审核中」，条目被锁住，连「绑定对公账户」都点不开。
 */

describe('收款账户阶段', () => {
  it('能收分账款就是已绑好，不看渠道那边是什么状态', () => {
    for (const status of ['active', 'under_review', 'pending', 'failed', 'closed']) {
      expect(settleAccountStage(status, true)).toBe('bound')
    }
  })

  it('只有 accepts_settlement 为真才算已绑', () => {
    expect(isSettleBound(false)).toBe(false)
    expect(isSettleBound(null)).toBe(false)
    expect(isSettleBound(undefined)).toBe(false)
    expect(isSettleBound(true)).toBe(true)
    // `active` 但号码不齐备时后端给 false：这是「差用户那一步」，不是「已绑好」
    expect(settleAccountStage('active', false)).toBe('ready')
  })

  it('渠道还在审就是 reviewing，用户该等', () => {
    expect(settleAccountStage('pending', false)).toBe('reviewing')
    expect(settleAccountStage('under_review', false)).toBe('reviewing')
  })

  it('渠道已通过、还没绑卡就是 ready，差的是用户那一步', () => {
    // BUG-017：`D` 档（开户成功但未建结算账户）后端记成 active，这里必须落在 ready，
    // 不能落成 reviewing —— 否则用户点不开「绑定对公账户」。
    expect(settleAccountStage('active', false)).toBe('ready')
  })

  it('渠道明确拒绝就是 failed，单独成一态而不是并进 none', () => {
    // BUG-013：并进 none 会显示成「待认证」，用户以为等着就行，而实际要回去核对资料。
    expect(settleAccountStage('failed', false)).toBe('failed')
  })

  it('还没开户（含主动解绑）才是 none', () => {
    expect(settleAccountStage('closed', false)).toBe('none')
    expect(settleAccountStage(undefined, false)).toBe('none')
    expect(settleAccountStage(null, null)).toBe('none')
  })

  it('渠道明确拒绝时不能同时说「还在审核」', () => {
    expect(isSettleRejected('failed')).toBe(true)
    expect(isSettleUnderReview('failed')).toBe(false)
  })

  it('审核中与已拒绝互斥', () => {
    expect(isSettleUnderReview('under_review')).toBe(true)
    expect(isSettleUnderReview('pending')).toBe(true)
    expect(isSettleUnderReview('active')).toBe(false)
    expect(isSettleUnderReview('failed')).toBe(false)
    expect(isSettleRejected('under_review')).toBe(false)
    expect(isSettleRejected('active')).toBe(false)
  })
})

describe('渠道拒绝的原话', () => {
  it('渠道给了原因就原样透出', () => {
    expect(settleProviderErrorText('failed', '渠道企业开户审核未通过（证照不清晰）', false)).toBe(
      '渠道企业开户审核未通过（证照不清晰）',
    )
  })

  it('没有原因就没有提示', () => {
    expect(settleProviderErrorText('failed', '', false)).toBe('')
    expect(settleProviderErrorText('failed', '   ', false)).toBe('')
    expect(settleProviderErrorText('failed', null, false)).toBe('')
  })

  it('已开通且能收款时不提旧伤', () => {
    // 那是一次翻篇的失败；再挂着会让人以为现在还有问题。
    expect(settleProviderErrorText('active', '上次失败原因', true)).toBe('')
  })

  it('换卡失败导致账户被解绑时，原因要留着', () => {
    // 状态仍是 active，但已不能收款：用户看到「已认证 + 未设置」而无从下手，原因必须留着。
    expect(settleProviderErrorText('active', '换卡失败原因', false)).toBe('换卡失败原因')
  })
})
