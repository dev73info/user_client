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
  it('电签担保卡只显示发布方式，不拼待付定金', () => {
    const wrapper = mount(RequirementHallCard, {
      props: { card: requirement('platform_guarantee') },
    })
    expect(wrapper.get('.pay-mode-chip').text()).toBe('电签担保')
    wrapper.unmount()
  })

  it('自管卡只显示发布方式，不拼待开发', () => {
    const wrapper = mount(RequirementHallCard, {
      props: { card: requirement('self_managed') },
    })
    expect(wrapper.get('.pay-mode-chip').text()).toBe('无电签约定')
    wrapper.unmount()
  })
})
