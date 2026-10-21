import { describe, expect, it } from 'vitest'

import type { PointsTransfer, UserPointsLog } from '@/api/points'
import {
  POINTS_RECORD_TABS,
  pointsLogBadgeClass,
  pointsLogDeltaLabel,
  pointsLogMeta,
  pointsLogTitle,
  pointsSelfName,
  pointsTransferBadgeClass,
  pointsTransferBadgeLabel,
  pointsTransferFee,
  pointsTransferMatchesKeyword,
  pointsTransferMatchesScope,
  pointsTransferMeta,
  pointsTransferReceived,
  pointsTransferScopes,
} from '@/shared/pointsDisplay'

/** 只填展示层用得到的字段；其余字段与这些函数无关。 */
function transferOf(overrides: Partial<PointsTransfer> = {}): PointsTransfer {
  return {
    id: 1,
    from_username: 'alice',
    to_username: 'bob',
    amount: 100,
    fee: 5,
    received: 95,
    note: null,
    created_at: '2026-10-21 10:00',
    ...overrides,
  }
}

function logOf(overrides: Partial<UserPointsLog> = {}): UserPointsLog {
  return {
    id: 1,
    username: 'alice',
    delta: 20,
    balance_after: 120,
    reason: '打赏',
    source_type: null,
    source_id: null,
    operator: null,
    created_at: '2026-10-21 10:00',
    ...overrides,
  }
}

describe('pointsDisplay', () => {
  it('记录区两段的键与文案固定，页面标题不随状态变', () => {
    expect(POINTS_RECORD_TABS.map((tab) => tab.label)).toEqual(['打赏记录', '积分明细'])
  })

  it('手续费按费率向下取整，到账数是打赏金额减去手续费', () => {
    // 3% 的 33 是 0.99，向下取整为 0：手续费不按四舍五入多收
    expect(pointsTransferFee(33, 3)).toBe(0)
    expect(pointsTransferFee(100, 5)).toBe(5)
    expect(pointsTransferReceived(100, 5)).toBe(95)
  })

  it('金额为空或非正数时预览归零，不会出现负数到账', () => {
    expect(pointsTransferFee(null, 10)).toBe(0)
    expect(pointsTransferFee(0, 10)).toBe(0)
    expect(pointsTransferReceived(null, 10)).toBe(0)
    expect(pointsTransferReceived(-5, 10)).toBe(0)
  })

  it('方向档的读数按「我是付出方还是收到方」分，全部档给总条数', () => {
    const transfers = [
      transferOf({ id: 1, from_username: 'me', to_username: 'bob' }),
      transferOf({ id: 2, from_username: 'alice', to_username: 'me' }),
      transferOf({ id: 3, from_username: 'alice', to_username: 'bob' }),
    ]

    expect(pointsTransferScopes(transfers, 'me')).toEqual([
      { value: 'all', label: '全部', count: 3 },
      { value: 'sent', label: '我打赏的', count: 1 },
      { value: 'received', label: '我收到的', count: 1 },
    ])
  })

  it('方向档只看自己那一侧，与中间人无关', () => {
    const transfer = transferOf({ from_username: 'me', to_username: 'bob' })

    expect(pointsTransferMatchesScope(transfer, 'all', 'me')).toBe(true)
    expect(pointsTransferMatchesScope(transfer, 'sent', 'me')).toBe(true)
    expect(pointsTransferMatchesScope(transfer, 'received', 'me')).toBe(false)
    expect(pointsTransferMatchesScope(transfer, 'sent', 'bob')).toBe(false)
    expect(pointsTransferMatchesScope(transfer, 'received', 'bob')).toBe(true)
  })

  it('关键词命中对方用户名或附言任一即可，空关键词不筛', () => {
    const transfer = transferOf({ note: '谢谢帮忙' })

    expect(pointsTransferMatchesKeyword(transfer, '')).toBe(true)
    expect(pointsTransferMatchesKeyword(transfer, '   ')).toBe(true)
    expect(pointsTransferMatchesKeyword(transfer, 'BOB')).toBe(true)
    expect(pointsTransferMatchesKeyword(transfer, '帮忙')).toBe(true)
    expect(pointsTransferMatchesKeyword(transfer, 'carol')).toBe(false)
  })

  it('自己那一端显示「我」，另一端照写用户名', () => {
    expect(pointsSelfName('me', 'me')).toBe('我')
    expect(pointsSelfName('bob', 'me')).toBe('bob')
  })

  it('行说明按「有没有手续费 / 附言」拼，缺的那段不留空点', () => {
    expect(pointsTransferMeta(transferOf({ note: '谢谢', fee: 5 }))).toBe(
      '2026-10-21 10:00 · 手续费 5 · 谢谢',
    )
    expect(pointsTransferMeta(transferOf({ note: null, fee: 0 }))).toBe('2026-10-21 10:00')
  })

  it('收到的是扣过手续费的到账数并用成功色，打出去的按票面金额列示', () => {
    const received = transferOf({ from_username: 'alice', to_username: 'me' })
    const sent = transferOf({ from_username: 'me', to_username: 'bob' })

    expect(pointsTransferBadgeLabel(received, 'me')).toBe('+95')
    expect(pointsTransferBadgeClass(received, 'me')).toBe('wb-badge--success')
    expect(pointsTransferBadgeLabel(sent, 'me')).toBe('-100')
    expect(pointsTransferBadgeClass(sent, 'me')).toBe('')
  })

  it('明细标题在后端没给原因时兜一句通用文案', () => {
    expect(pointsLogTitle(logOf({ reason: '打赏' }))).toBe('打赏')
    expect(pointsLogTitle(logOf({ reason: null }))).toBe('积分变动')
  })

  it('明细行说明带变动后的余额，便于对账', () => {
    expect(pointsLogMeta(logOf({ balance_after: 380 }))).toBe('2026-10-21 10:00 · 变动后余额 380')
  })

  it('变动值带符号，增加用成功色、减少用危险色', () => {
    expect(pointsLogDeltaLabel(20)).toBe('+20')
    expect(pointsLogDeltaLabel(-20)).toBe('-20')
    expect(pointsLogBadgeClass(20)).toBe('wb-badge--success')
    expect(pointsLogBadgeClass(-20)).toBe('wb-badge--danger')
  })
})
