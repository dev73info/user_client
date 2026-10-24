import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useRequirementPublishForm } from '@/composables/useRequirementPublishForm'
import type { RequirementItem } from '@/api/requirements'
import type { RequirementPublishPayload } from '@/shared/requirementPublishForm'

/**
 * 发布 / 编辑实例的提交链：登录守卫 → 纯校验 → 请求 → 清草稿 → 收尾。
 *
 * 三条不能破的约定：
 * 1. 校验没过只 toast，不发请求；
 * 2. 草稿清理作用域与 `draft-scope` 一致——发布传空（沿用当前用户名）、编辑传 `edit-<需求号>`；
 * 3. 请求在跑时 `close()` 被 loading 守住；失败时弹窗留着、能再提交一次。
 *
 * 实例隔离与实名门禁在 requirementPublishFormComposable.spec.ts，纯校验在
 * requirementPublishForm.spec.ts。
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
    created_time: '2026-10-09 10:00:00',
    creator: 'customer',
    subscribe_status_change: false,
    title: '小程序订单页改版',
    description: '<p>需要重做订单列表与详情页，支持批量操作。</p>',
    acceptance_criteria: '<p>订单列表可翻页，详情页字段齐全。</p>',
    status: 'pending_review',
    budget: 3000,
    payment_mode: 'self_managed',
    development_cycle_days: null,
    ...patch,
  }
}

type Form = ReturnType<typeof useRequirementPublishForm>

/** 把 `clearDraft` 挂到实例的弹窗 ref 上（真实值来自模板 ref，这里只要这个方法）。 */
function attachModalRef(form: Form) {
  const clearDraft = vi.fn()
  form.modalRef.value = { clearDraft } as never
  return clearDraft
}

function fillValidForm(form: Form) {
  form.form.title = '小程序订单页改版'
  form.form.description = '<p>需要重做订单列表与详情页，支持批量操作。</p>'
  form.form.budget = '3000'
  form.form.acceptance = '<p>订单列表可翻页，详情页字段齐全。</p>'
}

function publishForm(options: Partial<Parameters<typeof useRequirementPublishForm>[0]> = {}) {
  return useRequirementPublishForm({
    mode: 'publish',
    draftScope: () => 'alice',
    submit: vi.fn(async () => {}),
    successMessage: '需求已发布，等待审核',
    failureMessage: '发布失败',
    ...options,
  })
}

beforeEach(() => {
  mocks.toast.mockReset()
})

describe('useRequirementPublishForm 的提交链', () => {
  it('校验失败只 toast，不发请求', async () => {
    const submit = vi.fn(async () => {})
    const form = publishForm({ submit })

    form.form.title = '短'
    await form.submit()

    expect(mocks.toast).toHaveBeenCalledWith('需求标题至少 4 个字符', 'error')
    expect(submit).not.toHaveBeenCalled()
  })

  it('发布成功：提交归一化载荷、清默认草稿、关弹窗并收尾', async () => {
    const submit = vi.fn(async (_payload: RequirementPublishPayload) => {})
    const onSubmitted = vi.fn(async () => {})
    const form = publishForm({ submit, onSubmitted })
    const clearDraft = attachModalRef(form)

    await form.open()
    fillValidForm(form)
    form.form.title = '  小程序订单页改版  '
    form.form.budget = ' 3000 '
    await form.submit()

    expect(submit).toHaveBeenCalledWith(
      {
        title: '小程序订单页改版',
        description: '<p>需要重做订单列表与详情页，支持批量操作。</p>',
        budget: 3000,
        acceptance_criteria: '<p>订单列表可翻页，详情页字段齐全。</p>',
        payment_mode: 'self_managed',
        development_cycle_days: undefined,
      },
      null,
    )
    expect(mocks.toast).toHaveBeenCalledWith('需求已发布，等待审核', 'success')
    // 发布清的是「当前用户的草稿」：不传作用域，沿用 `draft-scope`。
    expect(clearDraft).toHaveBeenCalledWith()
    expect(form.visible.value).toBe(false)
    expect(form.form.title).toBe('')
    expect(onSubmitted).toHaveBeenCalledTimes(1)
  })

  it('编辑成功：按需求号清草稿，关弹窗只复位付款模式与开发周期', async () => {
    const item = requirement()
    const submit = vi.fn(async () => {})
    const form = useRequirementPublishForm({
      mode: 'edit',
      draftScope: (target) => (target ? `edit-${target.requirement_id}` : ''),
      isAuthed: () => true,
      submit,
      successMessage: '需求已重新提交，等待审核',
      failureMessage: '重新提交失败',
    })
    const clearDraft = attachModalRef(form)

    await form.open(item)
    // 回填后改一处：提交后这处改动不应被「关弹窗」抹掉（编辑态的草稿恢复口径）。
    form.form.title = '小程序订单页改版（二次）'
    form.form.paymentMode = 'platform_guarantee'
    form.form.developmentCycleDays = '30'
    await form.submit()

    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ payment_mode: 'platform_guarantee', development_cycle_days: 30 }),
      item,
    )
    expect(clearDraft).toHaveBeenCalledWith(`edit-${item.requirement_id}`)
    expect(form.visible.value).toBe(false)
    expect(form.form.paymentMode).toBe('self_managed')
    expect(form.form.developmentCycleDays).toBe('')
    expect(form.form.title).toBe('小程序订单页改版（二次）')
  })

  it('编辑未登录：提交前拦下，不发请求', async () => {
    const submit = vi.fn(async () => {})
    const form = useRequirementPublishForm({
      mode: 'edit',
      draftScope: () => 'edit-x',
      isAuthed: () => false,
      submit,
      successMessage: '需求已重新提交，等待审核',
      failureMessage: '重新提交失败',
    })

    await form.open(requirement())
    await form.submit()

    expect(mocks.toast).toHaveBeenCalledWith('请先登录后再重新提交需求', 'error')
    expect(submit).not.toHaveBeenCalled()
  })

  it('请求在跑时 close 被忽略；失败时弹窗留着并用后端文案', async () => {
    let reject: (err: Error) => void = () => {}
    const submit = vi.fn(
      () =>
        new Promise<void>((_resolve, rejectFn) => {
          reject = rejectFn
        }),
    )
    const form = publishForm({ submit })

    await form.open()
    fillValidForm(form)

    const pending = form.submit()
    expect(form.loading.value).toBe(true)

    form.close()
    expect(form.visible.value).toBe(true)

    reject(new Error('预算低于平台下限'))
    await pending

    expect(mocks.toast).toHaveBeenCalledWith('预算低于平台下限', 'error')
    expect(form.visible.value).toBe(true)
    expect(form.loading.value).toBe(false)
  })

  it('失败时后端没给 message 就走实例的兜底文案', async () => {
    const form = publishForm({
      submit: async () => {
        throw 'boom'
      },
    })

    await form.open()
    fillValidForm(form)
    await form.submit()

    expect(mocks.toast).toHaveBeenCalledWith('发布失败', 'error')
  })
})
