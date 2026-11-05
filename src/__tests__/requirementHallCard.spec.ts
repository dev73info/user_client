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

describe('RequirementHallCard 担保方式标签', () => {
  it('电签担保卡只展示担保方式，不展示需求状态', () => {
    const wrapper = mount(RequirementHallCard, {
      props: { card: requirement('platform_guarantee') },
    })
    const badge = wrapper.get('.requirement-hall__badge--success')
    // 担保暂不开放测试：胶囊内追加一枚灰色 BETA（D-2026-11-05-04）。
    expect(badge.text()).toBe('电签担保 BETA')
    expect(badge.find('.beta-tag').classes()).toContain('t73-tag--tone-neutral')
    expect(wrapper.findAll('.requirement-hall__badge')).toHaveLength(1)
    expect(wrapper.text()).not.toContain('待付定金')
    wrapper.unmount()
  })

  it('自管卡只展示无电签约定，不展示需求状态', () => {
    const wrapper = mount(RequirementHallCard, {
      props: { card: requirement('self_managed') },
    })
    expect(wrapper.get('.requirement-hall__badge--warning').text()).toBe('无电签约定')
    expect(wrapper.findAll('.requirement-hall__badge')).toHaveLength(1)
    expect(wrapper.text()).not.toContain('待开发')
    wrapper.unmount()
  })

  it('已完成卡同样只保留担保方式', () => {
    const wrapper = mount(RequirementHallCard, {
      props: { card: requirement('platform_guarantee', 'completed') },
    })
    expect(wrapper.text()).not.toContain('已完成')
    expect(wrapper.get('.requirement-hall__badge--success').text()).toBe('电签担保 BETA')
    wrapper.unmount()
  })
})
