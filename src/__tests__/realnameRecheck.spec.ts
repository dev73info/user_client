import { describe, expect, it } from 'vitest'

import { shouldRecheckRealnameResult } from '@/shared/realnameRecheck'

/**
 * 账户页挂载时要不要回查一次实名结果（BUG-014）。
 *
 * 回查端点 `POST /api/realname/asign/result` 在历史版本里不是纯读操作：结果为「通过」时
 * 会无条件重放整套通过后的副作用，其中 `auto_sync_adapay_after_approve` 会向支付渠道
 * **重新发起企业开户**。账户页每次打开都静默回查一次，于是企业主体每次进页面就往渠道
 * 多送一次开户申请。
 *
 * 后端后来加了幂等短路，前端这一侧也不该再无条件问：已定论时这次回查没有信息量。
 */

describe('账户页挂载时的实名回查', () => {
  it('处理中要问，渠道那边可能已经出结果', () => {
    expect(shouldRecheckRealnameResult('pending')).toBe(true)
  })

  it('状态未知也要问，账户页可能根本没加载到记录', () => {
    expect(shouldRecheckRealnameResult(undefined)).toBe(true)
    expect(shouldRecheckRealnameResult(null)).toBe(true)
    expect(shouldRecheckRealnameResult('')).toBe(true)
  })

  it('已通过 / 已驳回不再问：回查不会改变什么，只是白跑一趟渠道', () => {
    expect(shouldRecheckRealnameResult('approved')).toBe(false)
    expect(shouldRecheckRealnameResult('rejected')).toBe(false)
  })
})
