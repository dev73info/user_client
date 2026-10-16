import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import WechatLoginQrModal from '@/components/WechatLoginQrModal.vue'
import QRCode from 'qrcode'

const mocks = vi.hoisted(() => ({ getStatus: vi.fn() }))

vi.mock('@/api/auth', () => ({ getWechatLoginQrStatus: mocks.getStatus }))
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,test') },
}))

describe('WeChat QR login confirmation', () => {
  let wrapper: ReturnType<typeof mount>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mocks.getStatus.mockResolvedValue({ token: null })
    wrapper = mount(WechatLoginQrModal, {
      props: { visible: true, url: 'https://example.invalid/oauth?state=pc-state', state: 'pc-state', pollSecret: 'pc-only-secret' },
      global: { stubs: { Teleport: true } },
    })
  })

  afterEach(() => {
    wrapper.unmount()
    vi.useRealTimers()
  })

  it('keeps waiting while phone authorization has not been confirmed', async () => {
    await flushPromises()
    await vi.advanceTimersByTimeAsync(6000)
    expect(wrapper.text()).toContain('核对电脑 IP 和登录时间')
    expect(wrapper.text()).toContain('手机确认后电脑才会登录')
    expect(mocks.getStatus).toHaveBeenCalledWith('pc-state', 'pc-only-secret')
    expect(QRCode.toDataURL).toHaveBeenCalledWith('https://example.invalid/oauth?state=pc-state', expect.any(Object))
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
    mocks.getStatus.mockImplementationOnce(() => new Promise((resolve) => { resolveStatus = resolve }))
    await vi.advanceTimersByTimeAsync(2000)
    await wrapper.get('button[aria-label="关闭微信扫码登录"]').trigger('click')
    resolveStatus({ token: 'confirmed-token' })
    await flushPromises()
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(wrapper.emitted('logged-in')).toBeUndefined()
  })

  it('masks the QR and keeps polling once the phone has scanned', async () => {
    await flushPromises()
    mocks.getStatus.mockResolvedValue({ token: null, status: 'scanned' })
    await vi.advanceTimersByTimeAsync(2000)
    expect(wrapper.text()).toContain('已扫码，等待手机确认')
    const calls = mocks.getStatus.mock.calls.length
    await vi.advanceTimersByTimeAsync(2000)
    // 待确认阶段还得继续轮询，否则手机点了确认 PC 也领不到令牌
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
    // 旧码与遮罩一起清掉，等父级拿回新码
    expect(wrapper.find('.wechat-authorization-modal__overlay').exists()).toBe(false)
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
    mocks.getStatus.mockImplementationOnce(() => new Promise((resolve) => { resolveStatus = resolve }))
    await vi.advanceTimersByTimeAsync(2000)
    await wrapper.setProps({ pollSecret: 'new-pc-secret' })
    resolveStatus({ token: 'old-token' })
    await flushPromises()
    expect(wrapper.emitted('logged-in')).toBeUndefined()
    await vi.advanceTimersByTimeAsync(2000)
    expect(mocks.getStatus).toHaveBeenLastCalledWith('pc-state', 'new-pc-secret')
  })
})
