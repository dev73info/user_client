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
    expect(meta('contract_signed', 'developer', 'in_development')?.actionLabel).toBe('去我的需求')
  })

  it('keeps the delivery entry to the developer only', () => {
    expect(meta('deposit_paid', 'developer', 'deposit_paid')?.actionLabel).toBe('去交付')
    expect(meta('deposit_paid', 'customer', 'deposit_paid')?.actionLabel).toBeUndefined()
  })

  it('ignores unknown event codes', () => {
    expect(meta('whatever', 'customer', 'deposit_paid')).toBeNull()
  })
})
