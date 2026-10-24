import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import RequirementPayModal from '@/components/requirements/RequirementPayModal.vue'
import type { RequirementItem } from '@/api/requirements'
import { useRequirementPayFlow } from '@/composables/useRequirementPayFlow'
/**
 * 通道切换的端到端回归：弹窗上点「微信」→ `v-model:channel`（= `@update:channel`）
 * → composable 的 `payChannel` → `createAdapayPayment` 的 channel 参数。
 *
 * 拆出 `RequirementPayModal` 时 emit 键写成 `updateChannel`，视图监听的是 `@update:channel`，
 * 两者对不上：事件永远不触发，点微信不改通道，下单永远按支付宝提交。type-check 与 eslint
 * 都发现不了这类错键，只能挂载后点一下、再看下单参数——本文件三层一起钉住：
 * 组件发出的键、父级监听真的被调到、下单参数跟着变。
 */

const mocks = vi.hoisted(() => ({ createPayment: vi.fn() }))

vi.mock('@/api/adapay', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/adapay')>()
  return {
    ...actual,
    createAdapayPayment: mocks.createPayment,
    getAdapayClientPlatform: () => 'desktop',
  }
})

vi.mock('ui_73info', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ui_73info')>()
  // 流程里只发 toast，测试不关心文案，统一吞掉
  const noop = (): void => {}
  return {
    ...actual,
    TMessage: { ...actual.TMessage, success: noop, error: noop, warning: noop, info: noop },
  }
})

function requirement(): RequirementItem {
  return {
    requirement_id: '2026-900000000301',
    title: '小程序订单页改版',
    creator: 'client_view',
    status: 'pending_deposit',
    payment_mode: 'platform_guarantee',
    budget: 10000,
  } as RequirementItem
}

/** Adapay 下单返回体（契约 `DepositPaymentResponse`，只列流程读得到的字段）。 */
function adapayPayment() {
  return {
    payment_id: 'pay_301',
    requirement_id: '2026-900000000301',
    milestone: 'deposit',
    pay_channel: 'alipay',
    pay_mode: 'escrow',
    amount_fen: 200000,
    amount_cny: '2000.00',
    status: 'created',
    pay_url: 'https://pay.example.com/301',
  }
}

/**
 * `MyRequirementsView` 那侧的最小复刻：`v-bind="modalBindings"` + `v-model:channel`。
 * 视图的 `@update:channel="updatePayChannel"` 与本模板等价，都编译成监听 `onUpdate:channel`。
 */
let flow!: ReturnType<typeof useRequirementPayFlow>

const PayHost = defineComponent({
  components: { RequirementPayModal },
  setup() {
    flow = useRequirementPayFlow({
      token: () => 'token',
      depositRatioPercent: () => 20,
      canPayRequirement: () => true,
    })
    const item = requirement()
    flow.openPayModal(item)
    return { flow, item }
  },
  template: `
    <RequirementPayModal
      v-bind="flow.modalBindings.value"
      v-model:channel="flow.payChannel.value"
    />
  `,
})

const mountHost = () => mount(PayHost, { global: { stubs: { teleport: true } } })

/** 点弹窗里的通道按钮，找不到就让断言当场炸掉（而不是静默跳过）。 */
async function clickChannel(wrapper: ReturnType<typeof mountHost>, label: string) {
  const modal = wrapper.findComponent(RequirementPayModal)
  const button = modal.findAll('button').find((item) => item.text().includes(label))
  expect(button).toBeTruthy()
  await button!.trigger('click')
  return modal
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createPayment.mockResolvedValue(adapayPayment())
})

describe('支付通道切换：从弹窗按键到下单参数', () => {
  it('点「微信」改掉通道，下单按 wechat 提交（不再永远按支付宝走）', async () => {
    const wrapper = mountHost()
    expect(flow.payChannel.value).toBe('alipay')

    const modal = await clickChannel(wrapper, '微信')

    // 父级 ref 变了，下一帧传给弹窗的 prop 才是 wechat
    expect(flow.payChannel.value).toBe('wechat')
    expect(modal.props('channel')).toBe('wechat')

    const outcome = await flow.submitPayment()
    expect(mocks.createPayment).toHaveBeenCalledWith(
      'token',
      '2026-900000000301',
      'deposit',
      'wechat',
      'desktop',
    )
    expect(outcome).toMatchObject({ kind: 'redirect-page', query: { channel: 'wechat' } })
    wrapper.unmount()
  })

  it('点回「支付宝」同样生效：开关是双向的，不是只能改一次', async () => {
    const wrapper = mountHost()

    await clickChannel(wrapper, '微信')
    expect(flow.payChannel.value).toBe('wechat')

    await clickChannel(wrapper, '支付宝')
    expect(flow.payChannel.value).toBe('alipay')

    await flow.submitPayment()
    expect(mocks.createPayment.mock.calls[0]?.[3]).toBe('alipay')
    wrapper.unmount()
  })

})

describe('支付通道切换：事件键本身', () => {
  it('组件发出的是 update:channel，旧键 updateChannel 不再出现', async () => {
    const wrapper = mountHost()
    const modal = await clickChannel(wrapper, '微信')

    expect(modal.emitted('update:channel')).toEqual([['wechat']])
    expect(modal.emitted('updateChannel')).toBeUndefined()
    wrapper.unmount()
  })
})
