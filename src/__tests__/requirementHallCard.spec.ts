import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import type { PublicRequirementSpotlightItem } from '@/api/requirements'
import RequirementHallCard from '@/components/requirement/RequirementHallCard.vue'

function requirement(paymentMode: 'platform_guarantee' | 'self_managed') {
  return {
    requirement_id: 'REQ-1',
    title: '需求标题',
    description: '<p>需求描述</p>',
    status: paymentMode === 'platform_guarantee' ? 'pending_deposit' : 'deposit_paid',
    payment_mode: paymentMode,
    budget: 100,
    created_at: '2026-10-01 10:00:00',
    updated_at: '2026-10-02 10:00:00',
  } as PublicRequirementSpotlightItem
}

describe('RequirementHallCard 发布方式标签', () => {
  it('电签担保卡把状态与担保方式拆成两枚 chip', () => {
    const wrapper = mount(RequirementHallCard, {
      props: { card: requirement('platform_guarantee') },
    })
    expect(wrapper.get('.requirement-hall__badge--guarantee').text()).toBe('电签担保')
    expect(wrapper.get('.requirement-hall__badge--info').text()).toBe('待付定金')
    wrapper.unmount()
  })

  it('自管卡的 deposit_paid 按自管口径写成「待开发」', () => {
    const wrapper = mount(RequirementHallCard, {
      props: { card: requirement('self_managed') },
    })
    expect(wrapper.get('.requirement-hall__badge--guarantee').text()).toBe('无电签约定')
    expect(wrapper.get('.requirement-hall__badge--info').text()).toBe('待开发')
    wrapper.unmount()
  })
})
