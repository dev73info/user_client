import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useConversationActionState } from '@/composables/useConversationActionState'
import { canSubmitDeliveryVersion } from '@/shared/devMyRequirementCard'
import { canOpenAcceptance } from '@/shared/requirementRowRules'
import { facts, requirement, version, SIGNED } from './helpers/requirementRowFixtures'

const mocks = vi.hoisted(() => ({
  listRequirements: vi.fn(),
  listMyRequirements: vi.fn(),
  customerContract: vi.fn(),
  developerContract: vi.fn(),
  depositRatio: vi.fn(),
  breachCase: vi.fn(),
}))

vi.mock('@/api/requirements', () => ({ listRequirements: mocks.listRequirements }))
vi.mock('@/api/devRequirements', () => ({ listMyRequirements: mocks.listMyRequirements }))
vi.mock('@/api/contracts', () => ({
  fetchContractSigningStatus: mocks.customerContract,
  fetchDevContractSigningStatus: mocks.developerContract,
}))
vi.mock('@/api/settings', () => ({ getDepositRatio: mocks.depositRatio }))
vi.mock('@/api/afterSales', () => ({ getRequirementBreachCase: mocks.breachCase }))

function actionRequirement(overrides: Record<string, unknown> = {}) {
  return {
    requirement_id: 'REQ-3',
    title: '担保交付',
    status: 'deposit_paid',
    payment_mode: 'platform_guarantee',
    bound_resource_id: 17,
    bound_resource_version_count: 1,
    delivered_at: '2026-10-28 02:22:50',
    ...overrides,
  }
}

async function loadActions(role: 'customer' | 'developer', row = actionRequirement()) {
  const state = useConversationActionState(() => ({
    token: 'test-token',
    requirementId: 'REQ-3',
    role,
  }))
  ;(role === 'customer' ? mocks.listRequirements : mocks.listMyRequirements).mockResolvedValue([
    row,
  ])
  await state.loadActions()
  return state
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.customerContract.mockResolvedValue({
    has_contract: true,
    party_a_signed: true,
    party_b_signed: true,
  })
  mocks.developerContract.mockResolvedValue({
    has_contract: true,
    party_a_signed: true,
    party_b_signed: true,
  })
  mocks.depositRatio.mockResolvedValue({ deposit_ratio_percent: 20 })
  mocks.breachCase.mockResolvedValue({ has_case: false })
})

describe('担保单付款后的交付与验收入口', () => {
  it('已交付且版本可读时，deposit_paid 允许客户验收', async () => {
    const state = await loadActions('customer')
    expect(state.canAcceptDelivery.value).toBe(true)

    const item = requirement({
      status: 'deposit_paid',
      delivered_at: '2026-10-28 02:22:50',
    })
    expect(canOpenAcceptance(item, facts({ contract: SIGNED, versions: [version('v1')] }))).toBe(
      true,
    )
  })

  it('deposit_paid 允许担保开发者交付，pending_final 不再提供重复交付', async () => {
    const state = await loadActions('developer')
    expect(state.canDeliver.value).toBe(true)
    expect(canSubmitDeliveryVersion(actionRequirement() as never)).toBe(true)
    expect(canSubmitDeliveryVersion(actionRequirement({ status: 'pending_final' }) as never)).toBe(
      false,
    )

    const pendingFinal = await loadActions(
      'developer',
      actionRequirement({ status: 'pending_final' }),
    )
    expect(pendingFinal.canDeliver.value).toBe(false)
  })

  it('只有版本但未登记交付时不开放验收', async () => {
    const state = await loadActions('customer', actionRequirement({ delivered_at: null }))
    expect(state.canAcceptDelivery.value).toBe(false)

    const item = requirement({ status: 'in_development', delivered_at: null })
    expect(canOpenAcceptance(item, facts({ contract: SIGNED, versions: [version('v1')] }))).toBe(
      false,
    )
  })
})
