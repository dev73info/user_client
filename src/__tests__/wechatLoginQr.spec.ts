import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import WechatLoginQrModal from '@/components/WechatLoginQrModal.vue'
import QRCode from 'qrcode'

const mocks = vi.hoisted(() => ({ getStatus: vi.fn() }))

vi.mock('@/api/auth', () => ({ getWechatMpLoginQrStatus: mocks.getStatus }))
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,test') },
}))

/** 服务号带参二维码：后端直接给图片地址，前端不自己画码。 */
const QR_IMAGE = 'https://mp.example.invalid/cgi-bin/showqrcode?ticket=T-1'

describe('WeChat service-account QR login', () => {
  let wrapper: ReturnType<typeof mount>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mocks.getStatus.mockResolvedValue({ token: null })
    wrapper = mount(WechatLoginQrModal, {
      props: { visible: true, imageUrl: QR_IMAGE, state: 'pc-state', pollSecret: 'pc-only-secret' },
      global: { stubs: { Teleport: true } },
    })
  })

  afterEach(() => {
    wrapper.unmount()
    vi.useRealTimers()
  })

  it('shows the service-account QR image and keeps waiting for the follow event', async () => {
    await flushPromises()
    await vi.advanceTimersByTimeAsync(6000)
    expect(wrapper.text()).toContain('关注服务号后自动登录')
    expect(wrapper.text()).toContain('扫码关注后电脑会自动登录')
    expect(mocks.getStatus).toHaveBeenCalledWith('pc-state', 'pc-only-secret')
    // 码是后端向微信申领的图片，不能再拿一段文本本地重画
    expect(wrapper.get('.wechat-authorization-modal__qr img').attributes('src')).toBe(QR_IMAGE)
    expect(QRCode.toDataURL).not.toHaveBeenCalled()
    expect(wrapper.html()).not.toContain('pc-only-secret')
    expect(wrapper.emitted('logged-in')).toBeUndefined()
  })

  it('completes login only after a confirmed token is returned and stops polling', async () => {
    await flushPromises()
    expect(wrapper.emitted('logged-in')).toBeUndefined()
    mocks.getStatus.mockResolvedValueOnce({ token: 'confirmed-token' })
    await vi.advanceTimersByTimeAsync(2000)
    expect(wrapper.emitted('logged-in')).toEqual([['confirmed-token']])
    const calls = mocks.getStatus.mock.calls.length
    await vi.advanceTimersByTimeAsync(6000)
    expect(mocks.getStatus).toHaveBeenCalledTimes(calls)
  })

  it('does not log in from a stale polling response after the dialog is closed', async () => {
    await flushPromises()
    let resolveStatus!: (result: { token: string }) => void
    mocks.getStatus.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveStatus = resolve
        }),
    )
    await vi.advanceTimersByTimeAsync(2000)
    await wrapper.get('button[aria-label="关闭微信扫码登录"]').trigger('click')
    resolveStatus({ token: 'confirmed-token' })
    await flushPromises()
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(wrapper.emitted('logged-in')).toBeUndefined()
  })

  it('keeps the QR visible and keeps polling when the server reports the scan', async () => {
    await flushPromises()
    mocks.getStatus.mockResolvedValue({ token: null, status: 'scanned' })
    await vi.advanceTimersByTimeAsync(2000)
    // 服务号流程没有「等手机点确认」这一档：不盖遮罩，码继续显示，继续轮询
    expect(wrapper.find('.wechat-authorization-modal__overlay').exists()).toBe(false)
    const calls = mocks.getStatus.mock.calls.length
    await vi.advanceTimersByTimeAsync(2000)
    expect(mocks.getStatus.mock.calls.length).toBeGreaterThan(calls)
    expect(wrapper.emitted('logged-in')).toBeUndefined()
  })

  it('shows the cancellation mask with a re-scan action and stops polling', async () => {
    await flushPromises()
    mocks.getStatus.mockResolvedValue({ token: null, status: 'cancelled' })
    await vi.advanceTimersByTimeAsync(2000)
    expect(wrapper.text()).toContain('登录已取消')
    expect(wrapper.text()).toContain('重新扫码')

    const calls = mocks.getStatus.mock.calls.length
    await vi.advanceTimersByTimeAsync(30_000)
    // 取消后状态不会再变回可登录，继续轮询只是白烧限流额度
    expect(mocks.getStatus.mock.calls.length).toBe(calls)

    await wrapper.get('button.wechat-authorization-modal__overlay-action').trigger('click')
    expect(wrapper.emitted('refresh')).toHaveLength(1)
    // 旧码与遮罩一起清掉，等父级拿回新码——继续显示已过期的码只会让人再扫一次
    expect(wrapper.find('.wechat-authorization-modal__overlay').exists()).toBe(false)
    expect(wrapper.find('.wechat-authorization-modal__qr img').exists()).toBe(false)
    expect(wrapper.text()).toContain('二维码生成中')
  })

  it('asks for a fresh QR when the old one has expired', async () => {
    await flushPromises()
    mocks.getStatus.mockResolvedValue({ token: null, status: 'expired' })
    await vi.advanceTimersByTimeAsync(2000)
    expect(wrapper.text()).toContain('二维码已过期')
    await wrapper.get('button.wechat-authorization-modal__overlay-action').trigger('click')
    expect(wrapper.emitted('refresh')).toHaveLength(1)
  })

  it('keeps waiting when the backend omits the status field', async () => {
    await flushPromises()
    await vi.advanceTimersByTimeAsync(4000)
    // 旧后端只回 token：不盖任何遮罩，行为与改造前一致
    expect(wrapper.find('.wechat-authorization-modal__overlay').exists()).toBe(false)
    expect(mocks.getStatus.mock.calls.length).toBeGreaterThan(1)
  })

  it('throttles polling so a single tab cannot exhaust the backend IP limit', async () => {
    await flushPromises()
    await vi.advanceTimersByTimeAsync(300_000)
    const calls = mocks.getStatus.mock.calls.length
    // 后端对扫码状态接口限流 120 次 / 300 秒，固定 2 秒轮询一轮就是 150 次，
    // 单个页签自己就能把额度打穿（2026-10-14 生产日志里连续的 429 就是这么来的）。
    expect(calls).toBeGreaterThan(0)
    expect(calls).toBeLessThanOrEqual(60)
  })

  it('does not poll without the browser-only credential', async () => {
    await flushPromises()
    await wrapper.setProps({ pollSecret: '' })
    mocks.getStatus.mockClear()
    await vi.advanceTimersByTimeAsync(6000)
    expect(mocks.getStatus).not.toHaveBeenCalled()
  })

  it('discards an in-flight result when the polling credential changes', async () => {
    await flushPromises()
    let resolveStatus!: (result: { token: string }) => void
    mocks.getStatus.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveStatus = resolve
        }),
    )
    await vi.advanceTimersByTimeAsync(2000)
    await wrapper.setProps({ pollSecret: 'new-pc-secret' })
    resolveStatus({ token: 'old-token' })
    await flushPromises()
    expect(wrapper.emitted('logged-in')).toBeUndefined()
    await vi.advanceTimersByTimeAsync(2000)
    expect(mocks.getStatus).toHaveBeenLastCalledWith('pc-state', 'new-pc-secret')
  })

  it('falls back to a readable hint when the QR image cannot load', async () => {
    await flushPromises()
    await wrapper.get('.wechat-authorization-modal__qr img').trigger('error')
    expect(wrapper.find('.wechat-authorization-modal__qr img').exists()).toBe(false)
    expect(wrapper.text()).toContain('二维码加载失败')
  })
})
