import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import WechatBindQrModal from '@/components/WechatBindQrModal.vue'

const mocks = vi.hoisted(() => ({ status: vi.fn() }))

const qqMocks = vi.hoisted(() => ({ status: vi.fn() }))
const unbindMocks = vi.hoisted(() => ({ status: vi.fn() }))

vi.mock('@/api/auth', () => ({
  getWechatBindQrStatus: mocks.status,
  getWechatUnbindQrStatus: unbindMocks.status,
  getQqUnbindQrStatus: qqMocks.status,
}))
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(async () => 'data:image/png;base64,qr') },
}))

describe('微信扫码绑定弹窗', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('确认后用同一组 state 与 poll_secret 回报成功', async () => {
    mocks.status.mockResolvedValue({ status: 'confirmed', token: null, username: 'alice' })
    const wrapper = mount(WechatBindQrModal, {
      props: {
        visible: true,
        url: 'https://open.weixin.qq.com/connect/qrconnect',
        state: 'state-1',
        pollSecret: 'poll-secret',
      },
    })
    await flushPromises()

    expect(mocks.status).toHaveBeenCalledWith('state-1', 'poll-secret')
    expect(wrapper.emitted('completed')).toEqual([[{ success: true }]])
    wrapper.unmount()
  })

  it('渠道失败时展示后端原因并停止轮询', async () => {
    mocks.status.mockResolvedValue({
      status: 'failed',
      token: null,
      username: null,
      message: '该微信账号已绑定其它账号',
    })
    const wrapper = mount(WechatBindQrModal, {
      props: {
        visible: true,
        url: 'https://open.weixin.qq.com/connect/qrconnect',
        state: 'state-1',
        pollSecret: 'poll-secret',
      },
    })
    await flushPromises()

    expect(wrapper.emitted('completed')).toEqual([
      [{ success: false, error: '该微信账号已绑定其它账号' }],
    ])
    wrapper.unmount()
  })

  it('微信解绑走解绑轮询接口，不再复用绑定状态', async () => {
    unbindMocks.status.mockResolvedValue({
      status: 'confirmed',
      token: null,
      username: 'alice',
      message: null,
    })
    const wrapper = mount(WechatBindQrModal, {
      props: {
        visible: true,
        url: 'https://open.weixin.qq.com/connect/qrconnect',
        state: 'unbind-state',
        pollSecret: 'unbind-secret',
        provider: 'wechat',
        mode: 'unbind',
      },
    })
    await flushPromises()

    expect(unbindMocks.status).toHaveBeenCalledWith('unbind-state', 'unbind-secret')
    expect(mocks.status).not.toHaveBeenCalled()
    expect(wrapper.emitted('completed')).toEqual([[{ success: true }]])
    wrapper.unmount()
  })

  it('QQ 解绑走 QQ 解绑轮询接口', async () => {
    qqMocks.status.mockResolvedValue({
      status: 'confirmed',
      token: null,
      username: 'alice',
      message: null,
    })
    const wrapper = mount(WechatBindQrModal, {
      props: {
        visible: true,
        url: 'https://graph.qq.com/oauth2.0/authorize',
        state: 'qq-state',
        pollSecret: 'qq-secret',
        provider: 'qq',
        mode: 'unbind',
      },
    })
    await flushPromises()

    expect(qqMocks.status).toHaveBeenCalledWith('qq-state', 'qq-secret')
    expect(mocks.status).not.toHaveBeenCalled()
    expect(unbindMocks.status).not.toHaveBeenCalled()
    expect(wrapper.emitted('completed')).toEqual([[{ success: true }]])
    wrapper.unmount()
  })
})
