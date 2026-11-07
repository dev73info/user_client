import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { RequirementFeeTerms } from '@/api/requirementFee'
import { useHomeDepositCard, type HomeDepositCardOptions } from '@/composables/useHomeDepositCard'
import type { DepositRequirement } from '@/composables/useDepositPayment'

/**
 * 深链 / 刷新场景：弹窗由 URL 直接挂载（`?modal=deposit&requirement_id=...`），
 * 不经过 `openDepositPayment`，费用行也必须出现。
 *
 * 回归背景：加载只在点击打开时触发，F5 后弹窗还在但「平台服务费（定金）」行消失。
 */
const mocks = vi.hoisted(() => ({
  route: { query: { modal: 'deposit', requirement_id: 'REQ-9' } } as {
    query: Record<string, string>
  },
  push: vi.fn(),
  replace: vi.fn(),
  getFeeTerms: vi.fn(),
}))

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return {
    ...actual,
    useRoute: () => mocks.route,
    useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  }
})

vi.mock('@/api/requirementFee', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/requirementFee')>()
  return { ...actual, getRequirementFeeTerms: mocks.getFeeTerms }
})

const terms: RequirementFeeTerms = {
  requirement_id: 'REQ-9',
  platform_fee_bps: 500,
  personal_income_tax_bps: 0,
  total_fen: 312_000,
  deposit_fen: 31_200,
  deposit_ratio_bps: 1_000,
  platform_fee_fen: 15_600,
  tax_fen: 0,
  developer_net_fen: 296_400,
  deposit_platform_fee_fen: 1_560,
  deposit_tax_fen: 0,
  deposit_developer_net_fen: 29_640,
  final_platform_fee_fen: 14_040,
  final_tax_fen: 0,
  final_developer_net_fen: 266_760,
  customer_breach_platform_fee_bps: 2_000,
  customer_breach_tax_bps: 0,
  snapshot_at: '2026-11-08 10:00:00',
}

const pendingRequirements = ref<DepositRequirement[]>([
  {
    id: 'REQ-9',
    title: '企业微信审批流连接器开发',
    status: 'pending_deposit',
    budget: 3_120,
    paymentMode: 'platform_guarantee',
  },
])

/** 深链挂载：页面一进就带着 modal=deposit，没有经过任何「点击打开」。 */
function mountDeepLinkCard() {
  let card!: ReturnType<typeof useHomeDepositCard>
  const Host = defineComponent({
    setup() {
      card = useHomeDepositCard({
        isMounted: () => true,
        pendingRequirements,
        loadPendingRequirements: async () => undefined,
        routeQueryValue: (key) => mocks.route.query[key] ?? '',
      } satisfies HomeDepositCardOptions)
      return () => null
    },
  })
  return { wrapper: mount(Host), card: () => card }
}

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  mocks.route.query = { modal: 'deposit', requirement_id: 'REQ-9' }
  mocks.getFeeTerms.mockResolvedValue(terms)
})

describe('首页定金弹窗：深链刷新', () => {
  it('按 URL 直接挂载时也加载费率，费用行与应付金额都在', async () => {
    const { wrapper, card } = mountDeepLinkCard()
    await vi.waitFor(() => {
      expect(mocks.getFeeTerms).toHaveBeenCalledWith(expect.any(String), 'REQ-9')
    })

    const bindings = card().depositModalBindings.value
    expect(bindings).not.toBeNull()
    expect(bindings?.platformFeeFen).toBe(1_560)
    expect(bindings?.platformFeePercent).toBe('5')
    // 快照定金 10%，不是 settings 默认的 20%
    expect(bindings?.payableFen).toBe(31_200)
    wrapper.unmount()
  })

  it('同一需求只请求一次，不会因打开与挂载触发两遍', async () => {
    const { wrapper } = mountDeepLinkCard()
    await vi.waitFor(() => expect(mocks.getFeeTerms).toHaveBeenCalled())
    expect(mocks.getFeeTerms).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('自管模式不请求费率，也不出现费用行', async () => {
    pendingRequirements.value = [
      {
        id: 'REQ-9',
        title: '自管需求',
        status: 'pending_deposit',
        budget: 3_120,
        paymentMode: 'self_managed',
      },
    ]
    const { wrapper, card } = mountDeepLinkCard()
    await Promise.resolve()

    expect(mocks.getFeeTerms).not.toHaveBeenCalled()
    expect(card().depositModalBindings.value?.platformFeeFen).toBeNull()
    wrapper.unmount()
  })
})
