import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import WechatBindQrModal from '@/components/WechatBindQrModal.vue'

const mocks = vi.hoisted(() => ({ status: vi.fn() }))

vi.mock('@/api/auth', () => ({ getWechatBindQrStatus: mocks.status }))
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
    expect(wrapper.emitted('bound')).toEqual([[{ success: true }]])
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

    expect(wrapper.emitted('bound')).toEqual([
      [{ success: false, error: '该微信账号已绑定其它账号' }],
    ])
    wrapper.unmount()
  })
})
