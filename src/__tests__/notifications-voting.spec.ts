/** 公开申请（解除合作 / 换开发）的表决：谁能投、投过之后、终结之后与卡片上的等待说明。 */
import { describe, expect, it } from 'vitest'

import { buildNotificationCards, canVoteHistoryDisclosure } from '@/shared/notifications'
import { disclosure } from './helpers/notifications'

describe('history disclosure voting', () => {
  it('只有轮到我这一票时才判定为可投', () => {
    const item = disclosure()
    // 前任开发者投 developer_consent、客户投 customer_consent
    expect(canVoteHistoryDisclosure(item, 'dev_old')).toBe(true)
    expect(canVoteHistoryDisclosure(item, 'cust')).toBe(true)
    // 现任开发者是申请人，申请本身等他确认，但他不投这两票
    expect(canVoteHistoryDisclosure(item, 'dev_new')).toBe(false)
    // 不相干的人没有票
    expect(canVoteHistoryDisclosure(item, 'someone_else')).toBe(false)
  })

  it('已经投过的那一票不再给按钮', () => {
    expect(canVoteHistoryDisclosure(disclosure({ developer_consent: 'approved' }), 'dev_old')).toBe(
      false,
    )
    expect(canVoteHistoryDisclosure(disclosure({ customer_consent: 'rejected' }), 'cust')).toBe(
      false,
    )
    // 另一方仍可投
    expect(canVoteHistoryDisclosure(disclosure({ developer_consent: 'approved' }), 'cust')).toBe(
      true,
    )
  })

  it('申请已终结（通过或未通过）后双方都不再可投', () => {
    for (const status of ['approved', 'rejected'] as const) {
      expect(canVoteHistoryDisclosure(disclosure({ status }), 'dev_old')).toBe(false)
      expect(canVoteHistoryDisclosure(disclosure({ status }), 'cust')).toBe(false)
    }
  })

  it('卡片上的投票状态说明按「等谁」分三种说法', () => {
    const [mine] = buildNotificationCards({ disclosures: [disclosure()], username: 'dev_old' })
    expect(mine?.canVote).toBe(true)
    expect(mine?.voteHint).toContain('还在等你这一票')

    const [applicant] = buildNotificationCards({ disclosures: [disclosure()], username: 'dev_new' })
    expect(applicant?.canVote).toBe(false)
    expect(applicant?.voteHint).toContain('等双方确认后自动公开')

    const [bystander] = buildNotificationCards({ disclosures: [disclosure()], username: 'other' })
    expect(bystander?.voteHint).toBe('前任开发者 待表决 · 客户 待表决')

    const [settled] = buildNotificationCards({
      disclosures: [
        disclosure({
          status: 'approved',
          developer_consent: 'approved',
          customer_consent: 'approved',
        }),
      ],
      username: 'dev_old',
    })
    expect(settled?.voteHint).toContain('已公开')
    expect(settled?.canVote).toBe(false)
  })

  it('公开申请卡片的标题取需求名，正文写清前后任与公开规则', () => {
    const [card] = buildNotificationCards({ disclosures: [disclosure()], username: 'cust' })
    expect(card?.title).toBe('企业官网改版')
    expect(card?.body[0]).toBe('REQ-1 · 前任开发者 dev_old，现任开发者 dev_new')
    expect(card?.meta).toBe('2026-03-05T09:00:00+08:00 发起')
  })
})
