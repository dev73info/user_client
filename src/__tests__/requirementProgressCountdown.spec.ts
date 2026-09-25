import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { h } from 'vue'

import RequirementProgressGuide from '@/components/RequirementProgressGuide.vue'

/**
 * 组件收到的 `settlement_available_at` 是后端给的东八区 `YYYY-MM-DD HH24:MI:SS` 时间串，
 * 组件按本地时间解析（与 `formatCnDateTime`、`timeValue` 同一口径）。为了让断言不依赖运行机器的
 * 时区，这里直接从本地时钟往前 / 往后推，再拼成同样的格式。
 */
function localStamp(offsetMs: number): string {
  const date = new Date(Date.now() + offsetMs)
  const pad = (value: number) => String(value).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  )
}

function mountProgress(requirement: Record<string, unknown>) {
  return mount(RequirementProgressGuide, {
    props: {
      requirement: {
        requirement_id: '2026-1790295512639',
        title: '测试需求',
        status: 'completed',
        payment_mode: 'platform_guarantee',
        ...requirement,
      },
      paymentMode: 'platform_guarantee',
      view: 'dev',
    },
    global: {
      // 组件只用到原生元素与 <li>，没有 UI 库依赖；这个 stub 仅为将来加组件时兜底。
      stubs: { transition: h('div') },
    },
  })
}

describe('RequirementProgressGuide 结算倒计时', () => {
  it('尾款已缴、分账排队中时，结算这一步的副标题给出剩余天数', () => {
    const wrapper = mountProgress({
      status: 'pending_settlement',
      settlement_available_at: localStamp(3 * 86_400_000 - 5_000),
    })

    expect(wrapper.text()).toContain('还有 3 天完成结算')
    expect(wrapper.text()).not.toContain('完成结算与评价')
  })

  it('计划分账时间已过但还没落地时，副标题不再说还剩几天', () => {
    const wrapper = mountProgress({
      status: 'pending_settlement',
      settlement_available_at: localStamp(-3_600_000),
    })

    expect(wrapper.text()).toContain('等待渠道分账完成')
  })

  it('没有待分账的需求仍用原来的副标题', () => {
    const developing = mountProgress({ status: 'in_development' })
    expect(developing.text()).toContain('完成结算与评价')

    // 待分账状态但后端没给出计划分账时间（例如等待期为 0、分账已提交）时同样退回原文案。
    const withoutDeadline = mountProgress({ status: 'pending_settlement' })
    expect(withoutDeadline.text()).toContain('完成结算与评价')
  })
})
