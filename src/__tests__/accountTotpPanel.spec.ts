/**
 * 「身份验证器」面板的展示与事件：状态行、绑定二维码、动态码输入与停用确认。
 *
 * 组件不碰接口与 toast，所以这里只验证「父级给了什么就显示什么、点了什么就回传什么」，
 * 请求与错误映射在 `accountTotpSettings.spec.ts` 里测。
 */
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import TotpSettingsPanel from '@/components/account/TotpSettingsPanel.vue'

// jsdom 没有 canvas，qrcode 的浏览器实现画不出图；这里只验证「拿到地址就渲染 img」这条链路。
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,QQ==') },
}))

function mountPanel(overrides: Record<string, unknown> = {}) {
  return mount(TotpSettingsPanel, {
    props: {
      enabled: false,
      confirmedAt: null,
      statusLoading: false,
      setup: null,
      setupLoading: false,
      bindCode: '',
      enableSubmitting: false,
      disableVisible: false,
      disableCode: '',
      disableSubmitting: false,
      ...overrides,
    },
  })
}

describe('TotpSettingsPanel：身份验证器面板', () => {
  it('未启用时显示状态与「生成绑定二维码」，点击回传 start-setup', async () => {
    const wrapper = mountPanel()

    expect(wrapper.text()).toContain('未启用')
    const button = wrapper.findAll('button').find((item) => item.text().includes('生成绑定二维码'))
    expect(button).toBeTruthy()

    await button!.trigger('click')
    expect(wrapper.emitted('start-setup')).toHaveLength(1)
    wrapper.unmount()
  })

  it('已启用时显示启用时间与「停用」，点击回传 start-disable', async () => {
    const wrapper = mountPanel({ enabled: true, confirmedAt: '2026-11-06 21:00:00' })

    expect(wrapper.text()).toContain('已启用')
    expect(wrapper.text()).toContain('启用时间：2026-11-06 21:00:00')
    const button = wrapper.findAll('button').find((item) => item.text().trim() === '停用')
    await button!.trigger('click')
    expect(wrapper.emitted('start-disable')).toHaveLength(1)
    wrapper.unmount()
  })

  it('绑定态画出二维码、密钥与 6 位动态码输入，输入与按钮各回传自己的事件', async () => {
    const wrapper = mountPanel({
      setup: {
        secret: 'JBSWY3DPEHPK3PXP',
        otpauth_uri: 'otpauth://totp/73Info:demo?secret=JBSWY3DPEHPK3PXP',
      },
    })
    await flushPromises()

    expect(wrapper.find('img').attributes('src')).toContain('data:image/png')
    expect(wrapper.text()).toContain('JBSWY3DPEHPK3PXP')
    expect(wrapper.text()).toContain('使用 Microsoft Authenticator 扫码')

    await wrapper.find('input').setValue('123456')
    expect(wrapper.emitted('update:bind-code')).toEqual([['123456']])

    const copy = wrapper.findAll('button').find((item) => item.text().includes('复制密钥'))
    await copy!.trigger('click')
    expect(wrapper.emitted('copy-secret')).toHaveLength(1)

    const enable = wrapper.findAll('button').find((item) => item.text().includes('确认启用'))
    await enable!.trigger('click')
    expect(wrapper.emitted('confirm-enable')).toHaveLength(1)

    const cancel = wrapper.findAll('button').find((item) => item.text().trim() === '取消')
    await cancel!.trigger('click')
    expect(wrapper.emitted('cancel-setup')).toHaveLength(1)
    wrapper.unmount()
  })

  it('停用确认展开后回传动态码与确认动作', async () => {
    const wrapper = mountPanel({ enabled: true, disableVisible: true })

    await wrapper.find('input').setValue('654321')
    expect(wrapper.emitted('update:disable-code')).toEqual([['654321']])

    const confirm = wrapper.findAll('button').find((item) => item.text().includes('确认停用'))
    await confirm!.trigger('click')
    expect(wrapper.emitted('confirm-disable')).toHaveLength(1)
    wrapper.unmount()
  })
})
