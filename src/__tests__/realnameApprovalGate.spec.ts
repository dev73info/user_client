import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useRealnameApprovalGate } from '@/composables/useRealnameApprovalGate'
import { HttpError } from '@/api/http'

/**
 * 发布前的实名门禁：只做「取状态」这件有副作用的事，跳转全靠注入的回调。
 *
 * 四个分支的去向不能串：通过 → 放行；审核中 → 停在这里（**不跳**，跳了会让人以为要重新提交）；
 * 未通过 / 查无记录（404）→ 去实名页；其它异常 → 只报错、不跳。
 */

const mocks = vi.hoisted(() => ({
  getVerification: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('@/api/realname', () => ({ getMyRealnameVerification: mocks.getVerification }))

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

const REDIRECT_TARGET = '/workbench/requirements?modal=publish'

function setup(authed = true) {
  const onNeedLogin = vi.fn()
  const onNeedRealname = vi.fn()
  const gate = useRealnameApprovalGate({
    token: () => (authed ? 'token-1' : ''),
    isAuthed: () => authed,
    hydrate: () => {},
    onNeedLogin,
    onNeedRealname,
  })
  return { gate, onNeedLogin, onNeedRealname }
}

beforeEach(() => {
  mocks.getVerification.mockReset()
  mocks.toast.mockReset()
})

describe('实名门禁', () => {
  it('已通过：放行，不提示不跳转', async () => {
    mocks.getVerification.mockResolvedValue({ status: 'approved' })
    const { gate, onNeedLogin, onNeedRealname } = setup()

    await expect(gate.ensureApproved(REDIRECT_TARGET)).resolves.toBe(true)
    expect(onNeedLogin).not.toHaveBeenCalled()
    expect(onNeedRealname).not.toHaveBeenCalled()
    expect(mocks.toast).not.toHaveBeenCalled()
  })

  it('审核中：拦下但不跳转', async () => {
    mocks.getVerification.mockResolvedValue({ status: 'pending' })
    const { gate, onNeedRealname } = setup()

    await expect(gate.ensureApproved(REDIRECT_TARGET)).resolves.toBe(false)
    expect(mocks.toast).toHaveBeenCalledWith('实名认证审核中，通过后可发布需求', 'warning')
    expect(onNeedRealname).not.toHaveBeenCalled()
  })

  it('未通过：提示后带着回跳地址去实名页', async () => {
    mocks.getVerification.mockResolvedValue({ status: 'rejected' })
    const { gate, onNeedRealname } = setup()

    await expect(gate.ensureApproved(REDIRECT_TARGET)).resolves.toBe(false)
    expect(mocks.toast).toHaveBeenCalledWith('实名认证未通过，请重新提交后再发布需求', 'warning')
    expect(onNeedRealname).toHaveBeenCalledWith(REDIRECT_TARGET)
  })

  it('查无记录（404）按未实名处理', async () => {
    mocks.getVerification.mockRejectedValue(new HttpError(404, 'not found'))
    const { gate, onNeedRealname } = setup()

    await expect(gate.ensureApproved(REDIRECT_TARGET)).resolves.toBe(false)
    expect(mocks.toast).toHaveBeenCalledWith('发布需求前请先完成实名认证', 'warning')
    expect(onNeedRealname).toHaveBeenCalledWith(REDIRECT_TARGET)
  })

  it('其它异常只报错，不把人踢去实名页', async () => {
    mocks.getVerification.mockRejectedValue(new Error('实名服务 500'))
    const { gate, onNeedRealname } = setup()

    await expect(gate.ensureApproved(REDIRECT_TARGET)).resolves.toBe(false)
    expect(mocks.toast).toHaveBeenCalledWith('实名服务 500', 'error')
    expect(onNeedRealname).not.toHaveBeenCalled()
  })

  it('未登录：先去登录，不发实名请求', async () => {
    const { gate, onNeedLogin } = setup(false)

    await expect(gate.ensureApproved(REDIRECT_TARGET)).resolves.toBe(false)
    expect(mocks.getVerification).not.toHaveBeenCalled()
    expect(mocks.toast).toHaveBeenCalledWith('发布需求前请先登录', 'info')
    expect(onNeedLogin).toHaveBeenCalledWith(REDIRECT_TARGET)
  })
})
