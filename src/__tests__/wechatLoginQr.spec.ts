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
