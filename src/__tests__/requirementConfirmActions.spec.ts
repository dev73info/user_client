import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useRequirementConfirmActions } from '@/composables/useRequirementConfirmActions'
import type { RequirementItem } from '@/api/requirements'
import type { PublicMcResourceVersionItem } from '@/api/resources'
import type { RequirementRowFacts } from '@/shared/requirementRowRules'

/**
 * 取消 / 确认完成 / 验收 / 售后 / 评价五个收尾动作的编排层。
 *
 * 三条不能破的约定：
 * 1. **验收的时序**：组件先派发 `submitted` 再派发 `close`（同步），所以需求 id 必须在任何
 *    `await` 之前取到——否则刷新完列表就拿不到目标行，尾款入口再也打不开；
 * 2. **担保 / 无担保分叉**：`requestFinalPayment` 只服务无担保需求，担保需求走验收 → 支付，
 *    丢了这道守卫就会给担保需求发 `final-payment` 请求；
 * 3. **守卫各留各的**：取消与确认完成各自一条 loading，互不阻挡，但都挡自己的 `close`。
 */

const mocks = vi.hoisted(() => ({
  cancel: vi.fn(),
  finalPayment: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('@/api/requirements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/requirements')>()
  return {
    ...actual,
    cancelRequirement: mocks.cancel,
    requestRequirementFinalPayment: mocks.finalPayment,
  }
})

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

const REQUIREMENT_ID = '2026-900000000601'

function version(id: number): PublicMcResourceVersionItem {
  return {
    id,
    resource_id: 42,
    version: `1.0.${id}`,
    resource: `https://cdn.example.com/file-${id}.zip`,
    note: null,
    creator: 'dev_view',
    created_at: '2026-10-01 10:00:00',
    is_current: true,
    price_fen: 0,
    purchasable: false,
  }
}

function requirement(patch: Partial<RequirementItem> = {}): RequirementItem {
  return {
    id: 1,
    requirement_id: REQUIREMENT_ID,
    subscribe_status_change: false,
    title: '订单页改版',
    description: '<p>订单列表与详情页。</p>',
    acceptance_criteria: '<p>字段齐全。</p>',
    status: 'in_development',
    budget: 3000,
    payment_mode: 'platform_guarantee',
    creator: 'client_view',
    created_at: '2026-09-01 10:00:00',
    updated_at: '2026-09-02 10:00:00',
    payment_status: 'deposit_paid',
    bound_resource_id: 42,
    bound_resource_title: '订单页模板',
    bound_resource_version_count: 1,
    development_cycle_days: 15,
    ...patch,
  } as RequirementItem
}

/** 双方已签 + 发过一版：担保模式的验收 / 尾款入口都在这个组合下才开。 */
function signedFacts(versions: PublicMcResourceVersionItem[] = [version(1)]): RequirementRowFacts {
  return {
    contract: { has_contract: true, status: 2, party_a_signed: true, party_b_signed: true },
    versions,
    invoiceSummary: null,
  }
}

function setup(patch: Partial<RequirementItem> = {}, facts?: RequirementRowFacts) {
  const item = requirement(patch)
  const rowFacts = () => facts ?? signedFacts()
  const reload = vi.fn(async () => {})
  const openPayModal = vi.fn()
  const controller = useRequirementConfirmActions({
    token: () => 'token-1',
    username: () => 'client_view',
    isAuthed: () => true,
    rowFacts,
    myRequirements: () => [item],
    reload,
    openPayModal,
  })
  return { item, controller, reload, openPayModal }
}

beforeEach(() => {
  mocks.cancel.mockReset()
  mocks.finalPayment.mockReset()
  mocks.toast.mockReset()
})

describe('验收', () => {
  it('组件同步派发 close 之后，仍能按已取到的需求 id 打开尾款弹窗', async () => {
    const { item, controller, reload, openPayModal } = setup()
    await controller.openAcceptanceModal(item)

    let releaseReload: () => void = () => {}
    reload.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseReload = resolve
        }),
    )

    const pending = controller.acceptanceModal.value.onSubmitted('passed')
    // 组件在 `submitted` 之后立刻派发 `close`：目标行被清空，id 必须已经在 await 之前取到。
    controller.acceptanceModal.value.onClose()
    releaseReload()
    await pending

    expect(openPayModal).toHaveBeenCalledWith(item)
  })

  it('验收不通过只刷新列表，不打开尾款弹窗', async () => {
    const { item, controller, reload, openPayModal } = setup()
    await controller.openAcceptanceModal(item)

    await controller.acceptanceModal.value.onSubmitted('rejected')

    expect(reload).toHaveBeenCalledTimes(1)
    expect(openPayModal).not.toHaveBeenCalled()
  })

  it('无担保需求 / 未签合同 / 没有交付版本时不给验收入口', async () => {
    const selfManaged = setup({ payment_mode: 'self_managed' })
    await selfManaged.controller.openAcceptanceModal(selfManaged.item)

    const unsigned = setup({}, { ...signedFacts(), contract: null })
    await unsigned.controller.openAcceptanceModal(unsigned.item)

    const noVersion = setup({}, signedFacts([]))
    await noVersion.controller.openAcceptanceModal(noVersion.item)

    expect(selfManaged.controller.acceptanceModal.value.visible).toBe(false)
    expect(unsigned.controller.acceptanceModal.value.visible).toBe(false)
    expect(noVersion.controller.acceptanceModal.value.visible).toBe(false)
    expect(mocks.toast).toHaveBeenCalledWith(
      '当前需求还不能验收，请确认双方已签合同且开发者已提交交付版本',
      'warning',
    )
  })
})

describe('确认完成（无担保模式）', () => {
  it('担保需求不发 final-payment 请求，只把弹窗收掉', async () => {
    const { item, controller } = setup()
    await controller.openFinalPaymentConfirm(item)
    expect(controller.confirmModals.value.finalPaymentVisible).toBe(true)

    await controller.confirmModals.value.onConfirmFinalPayment()

    expect(mocks.finalPayment).not.toHaveBeenCalled()
    expect(controller.confirmModals.value.finalPaymentVisible).toBe(false)
  })

  it('无担保需求确认完成：发请求 → 刷新列表 → 收掉弹窗', async () => {
    const { item, controller, reload } = setup({ payment_mode: 'self_managed' })
    await controller.openFinalPaymentConfirm(item)

    await controller.confirmModals.value.onConfirmFinalPayment()

    expect(mocks.finalPayment).toHaveBeenCalledWith('token-1', REQUIREMENT_ID)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(controller.confirmModals.value.finalPaymentVisible).toBe(false)
    expect(mocks.toast).toHaveBeenCalledWith('需求已确认完成', 'success')
  })

  it('入口守卫：不在开发中 / 没有绑定资源 / 没有交付版本都不开弹窗', async () => {
    const notDeveloping = setup({ status: 'pending_final' })
    await notDeveloping.controller.openFinalPaymentConfirm(notDeveloping.item)

    const noResource = setup({ bound_resource_id: null })
    await noResource.controller.openFinalPaymentConfirm(noResource.item)

    const noVersion = setup({}, signedFacts([]))
    await noVersion.controller.openFinalPaymentConfirm(noVersion.item)

    expect(notDeveloping.controller.confirmModals.value.finalPaymentVisible).toBe(false)
    expect(noResource.controller.confirmModals.value.finalPaymentVisible).toBe(false)
    expect(noVersion.controller.confirmModals.value.finalPaymentVisible).toBe(false)
  })
})

describe('取消需求', () => {
  it('已缴定金的担保需求可以取消；请求在跑时关不掉弹窗', async () => {
    const { item, controller, reload } = setup({ status: 'deposit_paid' })
    controller.openCancelConfirm(item)
    expect(controller.confirmModals.value.cancelVisible).toBe(true)

    let releaseCancel: (value: void) => void = () => {}
    mocks.cancel.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseCancel = resolve
        }),
    )

    const pending = controller.confirmModals.value.onConfirmCancel()
    // 请求还在跑：`close` 必须被 cancelLoading 挡住（与确认完成、转为我的资源同一套守卫）。
    controller.confirmModals.value.onCloseCancel()
    expect(controller.confirmModals.value.cancelVisible).toBe(true)

    releaseCancel()
    await pending

    expect(mocks.cancel).toHaveBeenCalledWith('token-1', REQUIREMENT_ID)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(controller.confirmModals.value.cancelVisible).toBe(false)
    expect(mocks.toast).toHaveBeenCalledWith('需求已取消', 'success')
  })

  it('不可取消的档位不打开弹窗', () => {
    const { item, controller } = setup({ status: 'in_development' })
    controller.openCancelConfirm(item)
    expect(controller.confirmModals.value.cancelVisible).toBe(false)
  })
})

describe('评价', () => {
  it('只有已完成的单子能评价，弹窗可见性同时看开关与目标行', async () => {
    const running = setup({ status: 'in_development' })
    running.controller.openCommentModal(running.item)
    expect(running.controller.commentModal.value.visible).toBe(false)

    const completed = setup({ status: 'completed', comment_rating: null, comment_text: null })
    completed.controller.openCommentModal(completed.item)
    expect(completed.controller.commentModal.value.visible).toBe(true)
    expect(completed.controller.commentModal.value.requirementId).toBe(REQUIREMENT_ID)

    await completed.controller.commentModal.value.onSubmitted()
    expect(completed.reload).toHaveBeenCalledTimes(1)
  })
})
