/** 资源过户通知：待我同意 / 我发起的两类卡片与「待我处理」计数。 */
import { describe, expect, it } from 'vitest'

import { buildNotificationCards, pendingActionCount } from '@/shared/notifications'
import { transfer } from './helpers/notifications'

describe('resource transfer notifications', () => {
  it('待我同意的过户：标题、来源、留言与后果，并给同意/拒绝动作', () => {
    const [card] = buildNotificationCards({
      transferInbox: [transfer({ message: '麻烦接手一下' })],
      username: 'dev_new',
    })

    expect(card?.kind).toBe('resource-transfer')
    expect(card?.kindLabel).toBe('资源过户')
    expect(card?.title).toBe('接收资源「企业官网模板」')
    expect(card?.body).toEqual([
      '来自 开发者 dev_old · 发起于 2026-04-10 09:00:00',
      '留言：麻烦接手一下',
      '同意后资源归你所有，原所有者将不再拥有它。',
    ])
    expect(card?.transferId).toBe(1)
    expect(card?.transferAction).toBe('respond')
    // 收件箱里的申请已经轮到我处理
    expect(pendingActionCount([card!])).toBe(1)
  })

  it('团队发起的过户取团队名', () => {
    const [card] = buildNotificationCards({
      transferInbox: [transfer({ from_team_id: 9, from_team_name: '设计组' })],
      username: 'dev_new',
    })
    expect(card?.body[0]).toBe('来自 团队 设计组 · 发起于 2026-04-10 09:00:00')
  })

  it('我发起的：pending 给撤销，已处理的不再给动作', () => {
    const [pending] = buildNotificationCards({
      myTransfers: [transfer({ to_user: 'dev_new', status: 'pending' })],
      username: 'dev_old',
    })
    expect(pending?.title).toBe('转出资源「企业官网模板」')
    expect(pending?.body[0]).toBe('转给 开发者 dev_new · 当前状态：等待对方同意')
    expect(pending?.transferAction).toBe('cancel')
    // 自己发起的申请不占「待我处理」
    expect(pendingActionCount([pending!])).toBe(0)

    const [accepted] = buildNotificationCards({
      myTransfers: [transfer({ status: 'accepted', responded_at: '2026-04-11 10:00:00' })],
      username: 'dev_old',
    })
    expect(accepted?.transferAction).toBeUndefined()
    expect(accepted?.body).toContain('对方处理于 2026-04-11 10:00:00')
  })
})
