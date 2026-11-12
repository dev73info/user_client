import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import InvoiceSummaryStrip from '@/components/invoice/InvoiceSummaryStrip.vue'

/**
 * 发票读数条：三格可点（全部 / 已开具 / 已红冲）映射 statusFilter，
 * 「处理中」是 requested ∪ under_review 的合计，没有等价的单值筛选，保持只读。
 */
function mountStrip(status: 'all' | 'approved' | 'reversed' = 'all') {
  return mount(InvoiceSummaryStrip, {
    props: {
      status,
      loading: false,
      stats: { total: 4, pending: 2, approved: 3, reversed: 1 },
    },
  })
}

function cell(wrapper: ReturnType<typeof mountStrip>, label: string) {
  const found = wrapper
    .findAll('.wb-strip__item--filter')
    .find((item) => item.find('.wb-strip__label').text() === label)
  if (!found) throw new Error(`读数格「${label}」不存在`)
  return found
}

describe('InvoiceSummaryStrip', () => {
  it('三格读数格可点并写回 status，处理中保持只读', async () => {
    const wrapper = mountStrip()
    expect(wrapper.findAll('.wb-strip__item--filter')).toHaveLength(3)
    expect(cell(wrapper, '全部记录').attributes('aria-pressed')).toBe('true')
    expect(cell(wrapper, '已开具').find('.wb-strip__value').text()).toBe('3')

    const pending = wrapper
      .findAll('.wb-strip__item')
      .find((item) => item.find('.wb-strip__label').text() === '处理中')
    expect(pending).toBeDefined()
    expect(pending!.element.tagName).toBe('DIV')
    expect(pending!.attributes('aria-pressed')).toBeUndefined()

    await cell(wrapper, '已开具').trigger('click')
    expect(wrapper.emitted('update:status')).toEqual([['approved']])
    await cell(wrapper, '已红冲').trigger('click')
    expect(wrapper.emitted('update:status')).toEqual([['approved'], ['reversed']])
    wrapper.unmount()
  })

  it('加载中读数显示破折号，刷新交给页面', async () => {
    const wrapper = mount(InvoiceSummaryStrip, {
      props: {
        status: 'approved',
        loading: true,
        stats: { total: 4, pending: 2, approved: 3, reversed: 1 },
      },
    })
    expect(cell(wrapper, '已开具').attributes('aria-pressed')).toBe('true')
    expect(cell(wrapper, '全部记录').find('.wb-strip__value').text()).toBe('—')
    // 加载中的刷新按钮本身不可点（与其它页同一口径），落定后再验证它能触发页面刷新
    await wrapper.setProps({ loading: false })
    await wrapper.find('.wb-strip__action button').trigger('click')
    expect(wrapper.emitted('refresh')).toHaveLength(1)
    wrapper.unmount()
  })
})
