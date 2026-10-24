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
 * 这几档对应四个真实缺陷，各钉一个：
 * - BUG-013：渠道把开户**驳回**（`failed`）被当成「已开通」，用户端显示「待绑卡」，
 *   引导他去绑一张根本绑不上的卡，还看不到「渠道已拒绝」。
 * - BUG-017：渠道**审核已通过**、只差结算账户没建（`active`）被当成「还在审核」，
 *   账户页永久停在「渠道审核中」，条目被锁住，连「绑定对公账户」都点不开。
 */

describe('收款账户阶段', () => {
  it('已绑卡就是已绑好，不看渠道那边是什么状态', () => {
    for (const status of ['active', 'under_review', 'pending', 'failed', 'not_onboarded']) {
      expect(settleAccountStage(status, 'SETTLE_1')).toBe('bound')
    }
  })

  it('渠道给的空白结算账户号不算已绑', () => {
    // 渠道不会给空白号；留着它只会让界面以为「绑好了」而少了那一步。
    expect(isSettleBound('   ')).toBe(false)
    expect(isSettleBound('')).toBe(false)
    expect(isSettleBound(null)).toBe(false)
    expect(isSettleBound(undefined)).toBe(false)
    expect(isSettleBound('SETTLE_1')).toBe(true)
    expect(settleAccountStage('active', '   ')).toBe('ready')
  })

  it('渠道还在审就是 reviewing，用户该等', () => {
    expect(settleAccountStage('pending', null)).toBe('reviewing')
    expect(settleAccountStage('under_review', null)).toBe('reviewing')
  })

  it('渠道已通过、还没绑卡就是 ready，差的是用户那一步', () => {
    // BUG-017：`D` 档（开户成功但未建结算账户）后端记成 active，这里必须落在 ready，
    // 不能落成 reviewing —— 否则用户点不开「绑定对公账户」。
    expect(settleAccountStage('active', null)).toBe('ready')
    expect(settleAccountStage('active', '')).toBe('ready')
  })

  it('渠道明确拒绝就是 failed，单独成一态而不是并进 none', () => {
    // BUG-013：并进 none 会显示成「待认证」，用户以为等着就行，而实际要回去核对资料。
    expect(settleAccountStage('failed', null)).toBe('failed')
    expect(settleAccountStage('failed', undefined)).toBe('failed')
  })

  it('还没到渠道那一步才是 none', () => {
    expect(settleAccountStage('not_onboarded', null)).toBe('none')
    expect(settleAccountStage(undefined, null)).toBe('none')
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
    expect(settleProviderErrorText('failed', '渠道企业开户审核未通过（证照不清晰）', null)).toBe(
      '渠道企业开户审核未通过（证照不清晰）',
    )
  })

  it('没有原因就没有提示', () => {
    expect(settleProviderErrorText('failed', '', null)).toBe('')
    expect(settleProviderErrorText('failed', '   ', null)).toBe('')
    expect(settleProviderErrorText('failed', null, null)).toBe('')
  })

  it('已开通且卡还在时不提旧伤', () => {
    // 那是一次翻篇的失败；再挂着会让人以为现在还有问题。
    expect(settleProviderErrorText('active', '上次失败原因', 'SETTLE_1')).toBe('')
  })

  it('换卡失败导致卡被解绑时，原因要留着', () => {
    // 状态仍是 active，但卡没了：用户看到「已认证 + 未设置」而无从下手，原因必须留着。
    expect(settleProviderErrorText('active', '换卡失败原因', null)).toBe('换卡失败原因')
  })
})
