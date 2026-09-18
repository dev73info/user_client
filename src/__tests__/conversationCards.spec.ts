import { describe, expect, it } from 'vitest'
import { conversationCardMeta } from '@/shared/conversationCards'

const meta = (
  actionType: string,
  role: 'customer' | 'developer',
  requirementStatus: string | null,
) => conversationCardMeta(actionType, 'REQ-1', role, requirementStatus)

describe('conversation status cards', () => {
  it('offers signing through asign with the in-app page as fallback', () => {
    const card = meta('contract_party_b_signed', 'customer', 'pending_deposit')
    expect(card?.actionLabel).toBe('查看合同')
    expect(card?.asignPreview).toBe(true)
    expect(card?.to).toEqual({
      name: 'contract-sign',
      query: { requirement_id: 'REQ-1', from: 'user' },
    })
  })

  it('drops the deposit button once the deposit is paid', () => {
    expect(meta('contract_signed', 'customer', 'pending_deposit')?.actionLabel).toBe('去支付定金')
    expect(meta('contract_signed', 'customer', 'deposit_paid')?.actionLabel).toBeUndefined()
    expect(meta('contract_signed', 'customer', 'in_development')?.actionLabel).toBeUndefined()
    // 开发者在合同签署完成 / 验收通过这两步都没有可做的动作，卡片只作通知。
    expect(meta('contract_signed', 'developer', 'in_development')?.actionLabel).toBeUndefined()
    expect(meta('acceptance_passed', 'developer', 'pending_final')?.actionLabel).toBeUndefined()
    expect(meta('acceptance_passed', 'customer', 'pending_final')?.actionLabel).toBe('去支付尾款')
  })

  it('keeps the delivery entry to the developer only', () => {
    expect(meta('deposit_paid', 'developer', 'deposit_paid')?.actionLabel).toBe('去交付')
    expect(meta('deposit_paid', 'customer', 'deposit_paid')?.actionLabel).toBeUndefined()
  })

  it('turns the delivered version card into a download for the customer', () => {
    const customer = meta('delivery_submitted', 'customer', 'in_development')
    expect(customer?.actionLabel).toBe('下载交付产物')
    expect(customer?.downloadDelivery).toBe(true)

    // 交付是开发者自己提交的，这张卡片对开发者只是通知，没有可做的动作。
    const developer = meta('delivery_submitted', 'developer', 'in_development')
    expect(developer?.actionLabel).toBeUndefined()
    expect(developer?.downloadDelivery).toBe(false)
  })

  it('treats the paid-but-unsettled card as a notification without a dead-end list jump', () => {
    // 尾款缴清只是进入「待分账」，还要等渠道分账，双方在这段时间都没有可执行的动作。
    expect(meta('final_paid', 'customer', 'pending_settlement')?.actionLabel).toBeUndefined()
    expect(meta('final_paid', 'developer', 'pending_settlement')?.actionLabel).toBeUndefined()
    expect(meta('final_paid', 'customer', 'pending_settlement')?.description).toContain('分账')
  })

  it('treats the settled card as a notification pointing at the after-sales entry', () => {
    const card = meta('requirement_settled', 'customer', 'completed')
    expect(card?.title).toBe('需求已结单')
    expect(card?.description).toContain('售后')
    // 售后入口就在需求卡片上，再给按钮只是空跳转回自己已经在的列表。
    expect(card?.actionLabel).toBeUndefined()
    expect(meta('requirement_settled', 'developer', 'completed')?.actionLabel).toBeUndefined()
  })

  it('sends the developer back to delivery after a rejected acceptance', () => {
    // 需求方验收不通过后，整改与重新交付是开发者的动作。
    expect(meta('acceptance_rejected', 'developer', 'in_development')?.actionLabel).toBe('去交付')
    expect(meta('acceptance_rejected', 'customer', 'in_development')?.actionLabel).toBeUndefined()
  })

  it('ignores unknown event codes', () => {
    expect(meta('whatever', 'customer', 'deposit_paid')).toBeNull()
  })
})
