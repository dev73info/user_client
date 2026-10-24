import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useRequirementPublishForm } from '@/composables/useRequirementPublishForm'
import type { RequirementItem } from '@/api/requirements'

/**
 * 发布 / 编辑两个 `PublishModal` 实例的编排层：实例隔离与实名门禁。
 *
 * 1. **一实例一份状态**：两个实例的表单、可视、草稿作用域必须互不影响（串了就是
 *    「编辑 A 需求」的草稿跑进「新建发布」）；
 * 2. 门禁的两处调用点都在：开弹窗一次、提交前复检一次，任一没过就不提交；
 * 3. `?modal=publish` 直接进页面时**不跑门禁**（提示留给用户点提交时再走）。
 *
 * 提交链（校验 → 载荷归一化 → 清草稿 → 收尾）在 requirementPublishFormSubmit.spec.ts；
 * 纯校验在 requirementPublishForm.spec.ts。
 */

const mocks = vi.hoisted(() => ({ toast: vi.fn() }))

vi.mock('@/components/PublishModal.vue', () => ({ default: {} }))

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

function requirement(patch: Partial<RequirementItem> = {}): RequirementItem {
  return {
    id: 1,
    requirement_id: '2026-900000000501',
    subscribe_status_change: false,
    title: '小程序订单页改版',
    description: '<p>需要重做订单列表与详情页，支持批量操作。</p>',
    acceptance_criteria: '<p>订单列表可翻页，详情页字段齐全。</p>',
    status: 'pending_review',
    budget: 3000,
    payment_mode: 'self_managed',
    development_cycle_days: null,
    updated_at: '2026-10-20 10:00:00',
    ...patch,
  }
}

beforeEach(() => {
  mocks.toast.mockReset()
})

describe('useRequirementPublishForm 的实例隔离', () => {
  it('两个实例的表单、可视与草稿作用域互相独立（工厂不是单例）', async () => {
    const publish = useRequirementPublishForm({
      mode: 'publish',
      draftScope: () => 'alice',
      submit: vi.fn(async () => {}),
      successMessage: '需求已发布，等待审核',
      failureMessage: '发布失败',
    })
    const edit = useRequirementPublishForm({
      mode: 'edit',
      draftScope: (item) => (item ? `edit-${item.requirement_id}` : ''),
      submit: vi.fn(async () => {}),
      successMessage: '需求已重新提交，等待审核',
      failureMessage: '重新提交失败',
    })

    publish.form.title = '只写在发布里'

    expect(edit.form.title).toBe('')
    expect(publish.draftScope.value).toBe('alice')
    // 编辑实例还没选中需求时关闭草稿（空作用域 = 不写 localStorage）。
    expect(edit.draftScope.value).toBe('')

    await edit.open(requirement())

    expect(edit.visible.value).toBe(true)
    expect(publish.visible.value).toBe(false)
    expect(publish.form.title).toBe('只写在发布里')
    expect(edit.form.title).toBe('小程序订单页改版')
    expect(edit.draftScope.value).toBe('edit-2026-900000000501')
  })
})

describe('useRequirementPublishForm 的实名门禁', () => {
  it('发布：开弹窗与提交前各跑一次，任一次没过都不提交', async () => {
    const ensureApproved = vi.fn(async () => true)
    const submit = vi.fn(async () => {})
    const form = useRequirementPublishForm({
      mode: 'publish',
      draftScope: () => 'alice',
      ensureApproved,
      submit,
      successMessage: '需求已发布，等待审核',
      failureMessage: '发布失败',
    })

    await form.open()
    expect(ensureApproved).toHaveBeenCalledTimes(1)
    expect(form.visible.value).toBe(true)

    form.form.title = '小程序订单页改版'
    form.form.description = '<p>需要重做订单列表与详情页，支持批量操作。</p>'
    form.form.budget = '3000'
    form.form.acceptance = '<p>订单列表可翻页，详情页字段齐全。</p>'
    await form.submit()

    expect(ensureApproved).toHaveBeenCalledTimes(2)
    expect(submit).toHaveBeenCalledTimes(1)

    // 复检没过：表单填得再完整也不发请求。
    ensureApproved.mockResolvedValue(false)
    await form.submit()
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('门禁没过时连弹窗都不开', async () => {
    const form = useRequirementPublishForm({
      mode: 'publish',
      draftScope: () => 'alice',
      ensureApproved: async () => false,
      submit: vi.fn(async () => {}),
      successMessage: '需求已发布，等待审核',
      failureMessage: '发布失败',
    })

    await form.open()

    expect(form.visible.value).toBe(false)
  })

  it('`?modal=publish` 入口不跑门禁，只把表单复位后打开', () => {
    const ensureApproved = vi.fn(async () => false)
    const form = useRequirementPublishForm({
      mode: 'publish',
      draftScope: () => 'alice',
      ensureApproved,
      submit: vi.fn(async () => {}),
      successMessage: '需求已发布，等待审核',
      failureMessage: '发布失败',
    })

    form.form.title = '上次留下的内容'
    form.openFromRoute()

    expect(ensureApproved).not.toHaveBeenCalled()
    expect(form.visible.value).toBe(true)
    expect(form.form.title).toBe('')
  })
})
