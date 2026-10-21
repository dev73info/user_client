import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import RequirementPayModal from '@/components/requirements/RequirementPayModal.vue'
import type { RequirementItem } from '@/api/requirements'

/**
 * 回归用例：组件 emit 的键必须与视图的 `@update:channel` 对上。
 *
 * 拆出组件时曾写成 `defineEmits({ updateChannel })` + `emit('updateChannel', …)`，
 * 而视图监听的是 `@update:channel`（→ `onUpdate:channel`），事件永远不触发：
 * 点「微信」不切通道，下单按支付宝提交。这类问题 type-check 与 eslint 都发现不了，
 * 只能靠挂载后点一下、看 emit 记录。
 */
const mountModal = (channel: 'alipay' | 'wechat' = 'alipay') =>
  mount(RequirementPayModal, {
    props: {
      visible: true,
      // 弹窗只读 requirement_id 与 title，这里只需要最小形状
      requirement: { requirement_id: 'req-1', title: '需求标题' } as unknown as RequirementItem,
      channel,
      loading: false,
      order: null,
      stageLabel: '定金',
      amount: 100,
      isFinalPayment: false,
      depositRatioPercent: 30,
    },
    global: { stubs: { teleport: true } },
  })

describe('RequirementPayModal 通道切换', () => {
  it('点「微信」发出 update:channel 事件（视图监听的就是这个键）', async () => {
    const wrapper = mountModal('alipay')
    const wechat = wrapper.findAll('button').find((button) => button.text().includes('微信'))
    expect(wechat).toBeTruthy()
    await wechat!.trigger('click')
    expect(wrapper.emitted('update:channel')).toEqual([['wechat']])
    wrapper.unmount()
  })

  it('点「支付宝」同样走 update:channel', async () => {
    const wrapper = mountModal('wechat')
    const alipay = wrapper.findAll('button').find((button) => button.text().includes('支付宝'))
    await alipay!.trigger('click')
    expect(wrapper.emitted('update:channel')).toEqual([['alipay']])
    wrapper.unmount()
  })

  it('当前通道按 props 高亮，且不再发出旧键 updateChannel', async () => {
    const wrapper = mountModal('wechat')
    const wechat = wrapper.findAll('button').find((button) => button.text().includes('微信'))
    expect(wechat!.classes()).toContain('active')
    expect(wrapper.emitted('updateChannel')).toBeUndefined()
    wrapper.unmount()
  })
})
