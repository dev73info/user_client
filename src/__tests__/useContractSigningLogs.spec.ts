import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import type { ContractDetail } from '@/api/contracts'
import { hydrateSigningLogs } from '@/composables/useContractSigningLogs'

import { contractDetail, signingLog } from './contractSignViewFixtures'

const mocks = vi.hoisted(() => ({ logs: vi.fn() }))

vi.mock('@/api/contracts', () => ({ fetchMyContractSigningLogs: mocks.logs }))

function contract(patch: Partial<ContractDetail> = {}) {
  return ref<ContractDetail | null>(contractDetail({ signing_logs: undefined, ...patch }))
}

describe('签约页补拉签署流水', () => {
  it('接口有记录时合并进合同，供签署记录区块渲染', async () => {
    mocks.logs.mockResolvedValue([signingLog()])
    const target = contract()

    await hydrateSigningLogs(target, 'token-1')

    expect(mocks.logs).toHaveBeenCalledWith('token-1', 88)
    expect(target.value?.signing_logs).toEqual([signingLog()])
  })

  it('接口返回空数组时保留合同原有字段', async () => {
    mocks.logs.mockResolvedValue([])
    const target = contract()

    await hydrateSigningLogs(target, 'token-1')

    expect(target.value?.signing_logs).toBeUndefined()
  })

  it('接口失败不阻断合同展示', async () => {
    mocks.logs.mockRejectedValue(new Error('network'))
    const target = contract()

    await expect(hydrateSigningLogs(target, 'token-1')).resolves.toBeUndefined()
    expect(target.value?.contract_no).toBe('HT-2026-0001')
  })
})
