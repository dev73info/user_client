import { mount } from '@vue/test-utils'
import { flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { RequirementItem } from '@/api/requirements'
import type { RequirementFeeTerms } from '@/api/requirementFee'
import RequirementPayModal from '@/components/requirements/RequirementPayModal.vue'
import { useRequirementPayFlow } from '@/composables/useRequirementPayFlow'

/**
 * 支付弹窗的金额必须与平台服务费同源：拿到费率快照后，「本次应付」取
 * `deposit_fen` / `total_fen - deposit_fen`，不再按当前 settings 的定金比例估算。
 *
 * 回归背景：快照 10% 定金、settings 已调到 20% 时，弹窗曾显示 20% 的金额，
 * 但后端按快照扣款，两行金额互相矛盾。
 */
const mocks = vi.hoisted(() => ({ getFeeTerms: vi.fn() }))

vi.mock('@/api/requirementFee', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/requirementFee')>()
  return { ...actual, getRequirementFeeTerms: mocks.getFeeTerms }
})

vi.mock('@/api/adapay', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/adapay')>()
  return { ...actual, getAdapayClientPlatform: () => 'desktop' }
})

const terms: RequirementFeeTerms = {
  requirement_id: 'REQ-9',
  platform_fee_bps: 500,
  personal_income_tax_bps: 0,
  total_fen: 860_000,
  deposit_fen: 86_000,
  deposit_ratio_bps: 1_000,
  platform_fee_fen: 43_000,
  tax_fen: 0,
  developer_net_fen: 817_000,
  deposit_platform_fee_fen: 4_300,
  deposit_tax_fen: 0,
  deposit_developer_net_fen: 81_700,
  final_platform_fee_fen: 38_700,
  final_tax_fen: 0,
  final_developer_net_fen: 735_300,
  customer_breach_platform_fee_bps: 2_000,
  customer_breach_tax_bps: 0,
  snapshot_at: '2026-11-08 10:00:00',
}

function requirement(status: RequirementItem['status']): RequirementItem {
  return {
    requirement_id: 'REQ-9',
    title: '订单同步插件',
    creator: 'client_view',
    status,
    payment_mode: 'platform_guarantee',
    budget: 10_000,
  } as RequirementItem
}

/**
 * 最小宿主：与视图一样 `v-bind="modalBindings"` + `v-model:channel`。
 * 当前 settings 故意给 20%，快照是 10%，两者不同才能证明取的是快照。
 */
function mountHost(status: RequirementItem['status']) {
  let flow!: ReturnType<typeof useRequirementPayFlow>
  const Host = defineComponent({
    components: { RequirementPayModal },
    setup() {
      flow = useRequirementPayFlow({
        token: () => 'token',
        depositRatioPercent: () => 20,
        canPayRequirement: () => true,
      })
      flow.openPayModal(requirement(status))
      return { flow }
    },
    template: `
      <RequirementPayModal
        v-bind="flow.modalBindings.value"
        v-model:channel="flow.payChannel.value"
      />
    `,
  })
  return { wrapper: mount(Host, { global: { stubs: { teleport: true } } }), flow: () => flow }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getFeeTerms.mockResolvedValue(terms)
})

describe('支付弹窗：金额与平台服务费同源', () => {
  it('定金阶段取快照 deposit_fen，而不是当前 20% 比例的估算', async () => {
    const { wrapper, flow } = mountHost('pending_deposit')
    await flushPromises()

    expect(flow().payFen.value).toBe(86_000)
    expect(flow().modalBindings.value.amount).toBe(860)
    expect(flow().modalBindings.value.platformFeeFen).toBe(4_300)

    const modal = wrapper.findComponent(RequirementPayModal)
    expect(modal.text()).toContain('¥860.00')
    expect(modal.text()).toContain('平台服务费（定金）')
    expect(modal.text()).toContain('¥43.00（5%')
    wrapper.unmount()
  })

  it('尾款阶段取「合同总额 − 定金」，平台服务费取 final_platform_fee_fen', async () => {
    const { wrapper, flow } = mountHost('pending_final')
    await flushPromises()

    expect(flow().payFen.value).toBe(774_000)
    expect(flow().modalBindings.value.platformFeeFen).toBe(38_700)

    const modal = wrapper.findComponent(RequirementPayModal)
    expect(modal.text()).toContain('¥7,740.00')
    expect(modal.text()).toContain('¥387.00（5%')
    wrapper.unmount()
  })

  it('快照 404 时才回落到当前 settings 估算', async () => {
    mocks.getFeeTerms.mockRejectedValueOnce(new Error('404'))
    const { wrapper, flow } = mountHost('pending_deposit')
    await flushPromises()

    expect(flow().payFen.value).toBe(200_000)
    expect(flow().modalBindings.value.platformFeeFen).toBeNull()
    wrapper.unmount()
  })
})
