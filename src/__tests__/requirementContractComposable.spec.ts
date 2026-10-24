import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useRequirementContract } from '@/composables/useRequirementContract'
import type { RequirementItem } from '@/api/requirements'

/**
 * 合同签署域：发起 / 签署 / 只看。
 *
 * 「只看」是本域唯一有分支的动作——优先跳爱签预览，取不到链接或接口异常时**必须回退**到
 * 本地合同页（合同还没在爱签发起签署、或爱签暂时不可用，都不能把用户卡在空白页）。
 * 两个跳转都由视图注入，所以这里能直接断言「去了哪一条」。
 */

const mocks = vi.hoisted(() => ({
  createContract: vi.fn(),
  previewUrl: vi.fn(),
  openSign: vi.fn(),
  openPreview: vi.fn(),
  created: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('@/api/contracts', () => ({
  createRequirementContract: mocks.createContract,
  fetchAsignRequirementPreviewUrl: mocks.previewUrl,
}))

vi.mock('ui_73info', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ui_73info')>()
  const toast =
    (type: 'success' | 'error' | 'warning' | 'info') =>
    (message: string): void =>
      mocks.toast(message, type)
  return {
    ...actual,
    TMessage: {
      ...actual.TMessage,
      success: toast('success'),
      error: toast('error'),
      warning: toast('warning'),
      info: toast('info'),
    },
  }
})

const REQUIREMENT_ID = '2026-900000000701'

function requirement(patch: Partial<RequirementItem> = {}): RequirementItem {
  return {
    id: 1,
    requirement_id: REQUIREMENT_ID,
    subscribe_status_change: false,
    title: '订单页改版',
    description: '<p>订单列表与详情页。</p>',
    acceptance_criteria: '<p>字段齐全。</p>',
    status: 'deposit_paid',
    budget: 3000,
    payment_mode: 'platform_guarantee',
    creator: 'client_view',
    created_at: '2026-09-01 10:00:00',
    updated_at: '2026-09-02 10:00:00',
    payment_status: 'deposit_paid',
    ...patch,
  } as RequirementItem
}

function setup(token = 'token-1') {
  const controller = useRequirementContract({
    token: () => token,
    isAuthed: () => token.length > 0,
    onOpenContractSign: mocks.openSign,
    onOpenPreviewUrl: mocks.openPreview,
    onCreated: mocks.created,
  })
  return controller
}

beforeEach(() => {
  mocks.createContract.mockReset()
  mocks.previewUrl.mockReset()
  mocks.openSign.mockReset()
  mocks.openPreview.mockReset()
  mocks.created.mockReset()
  mocks.created.mockResolvedValue(undefined)
  mocks.toast.mockReset()
})

describe('只看合同', () => {
  it('拿到爱签预览链接就整页跳过去，不再进本地合同页', async () => {
    mocks.previewUrl.mockResolvedValue('https://asign.example.com/preview/1')

    await setup().viewContractPreview(requirement())

    expect(mocks.previewUrl).toHaveBeenCalledWith('token-1', REQUIREMENT_ID)
    expect(mocks.openPreview).toHaveBeenCalledWith('https://asign.example.com/preview/1')
    expect(mocks.openSign).not.toHaveBeenCalled()
  })

  it('预览链接为空时回退本地合同页', async () => {
    mocks.previewUrl.mockResolvedValue('')

    const item = requirement()
    await setup().viewContractPreview(item)

    expect(mocks.openPreview).not.toHaveBeenCalled()
    expect(mocks.openSign).toHaveBeenCalledWith(item)
  })

  it('爱签接口异常时吞掉错误并回退本地合同页', async () => {
    mocks.previewUrl.mockRejectedValue(new Error('asign down'))

    const item = requirement()
    await setup().viewContractPreview(item)

    expect(mocks.openSign).toHaveBeenCalledWith(item)
    expect(mocks.toast).not.toHaveBeenCalled()
  })

  it('未登录直接进本地合同页，不发预览请求', async () => {
    const item = requirement()
    await setup('').viewContractPreview(item)

    expect(mocks.previewUrl).not.toHaveBeenCalled()
    expect(mocks.openSign).toHaveBeenCalledWith(item)
  })
})

describe('发起合同', () => {
  it('建合同 → 刷新列表 → 进合同页；发起中带着本条需求的 id', async () => {
    let releaseCreate: (value: void) => void = () => {}
    mocks.createContract.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseCreate = resolve
        }),
    )

    const controller = setup()
    const item = requirement()
    const pending = controller.createContract(item)
    expect(controller.contractCreatingId.value).toBe(REQUIREMENT_ID)

    releaseCreate()
    await pending

    expect(mocks.createContract).toHaveBeenCalledWith('token-1', REQUIREMENT_ID)
    expect(mocks.created).toHaveBeenCalledTimes(1)
    expect(mocks.openSign).toHaveBeenCalledWith(item)
    expect(controller.contractCreatingId.value).toBe('')
  })

  it('接口失败只提示，不刷新也不跳转，锚点复位', async () => {
    mocks.createContract.mockRejectedValueOnce(new Error('合同服务不可用'))

    const controller = setup()
    await controller.createContract(requirement())

    expect(mocks.toast).toHaveBeenCalledWith('合同服务不可用', 'error')
    expect(mocks.created).not.toHaveBeenCalled()
    expect(mocks.openSign).not.toHaveBeenCalled()
    expect(controller.contractCreatingId.value).toBe('')
  })

  it('未登录时不发请求', async () => {
    const controller = setup('')
    await controller.createContract(requirement())

    expect(mocks.createContract).not.toHaveBeenCalled()
    expect(mocks.toast).toHaveBeenCalledWith('请先登录后再继续操作', 'error')
  })
})
