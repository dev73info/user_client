import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import type { PublicRequirementSpotlightItem } from '@/api/requirements'
import RequirementHallCard from '@/components/requirement/RequirementHallCard.vue'

function requirement(
  paymentMode: 'platform_guarantee' | 'self_managed',
  status = paymentMode === 'platform_guarantee' ? 'pending_deposit' : 'deposit_paid',
) {
  return {
    requirement_id: 'REQ-1',
    title: '需求标题',
    description: '<p>需求描述</p>',
    status,
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
    expect(wrapper.get('.requirement-hall__badge--success').text()).toBe('电签担保')
    expect(wrapper.get('.requirement-hall__badge--info').text()).toBe('待付定金')
    wrapper.unmount()
  })

  it('自管卡的 deposit_paid 按自管口径写成「待开发」', () => {
    const wrapper = mount(RequirementHallCard, {
      props: { card: requirement('self_managed') },
    })
    expect(wrapper.get('.requirement-hall__badge--warning').text()).toBe('无电签约定')
    expect(wrapper.get('.requirement-hall__badge--info').text()).toBe('待开发')
    wrapper.unmount()
  })

  it('已完成卡不再展示状态 chip，只保留担保方式', () => {
    const wrapper = mount(RequirementHallCard, {
      props: { card: requirement('platform_guarantee', 'completed') },
    })
    expect(wrapper.text()).not.toContain('已完成')
    expect(wrapper.get('.requirement-hall__badge--success').text()).toBe('电签担保')
    wrapper.unmount()
  })

  it('担保单的「已付定金」不再展示状态 chip', () => {
    const wrapper = mount(RequirementHallCard, {
      props: { card: requirement('platform_guarantee', 'deposit_paid') },
    })
    expect(wrapper.find('.requirement-hall__badge--info').exists()).toBe(false)
    expect(wrapper.get('.requirement-hall__badge--success').text()).toBe('电签担保')
    wrapper.unmount()
  })
})
