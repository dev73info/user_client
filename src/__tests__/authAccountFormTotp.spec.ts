/** 账号密码面板的三条 TOTP 展示分支：免密登录、密码后动态码、默认入口。 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AccountForm from '@/components/authModal/AccountForm.vue'

function mountForm(overrides: Record<string, unknown> = {}) {
  return mount(AccountForm, {
    props: {
      authMode: 'login',
      authUsername: 'totp_smoke',
      authPassword: '',
      authEmail: '',
      authEmailCode: '',
      authInviteCode: '',
      loginRequiresTwoFactor: false,
      loginTwoFactorDelivery: 'email',
      loginAuthenticatorMode: false,
      authAuthenticatorCode: '',
      acceptTerms: true,
      sendCodeLoading: false,
      sendCodeCountdown: 0,
      authLoading: false,
      turnstileEnabled: false,
      turnstileAction: 'login',
      turnstileNonce: 0,
      preferInAppOauth: false,
      showInAppOauthPanel: false,
      ...overrides,
    },
    global: { stubs: { RouterLink: true } },
  })
}

describe('AccountForm：TOTP 登录分支', () => {
  it('默认展示「使用 Authenticator 登录」，点击回传开启', async () => {
    const wrapper = mountForm()
    const toggle = wrapper.findAll('button').find((item) =>
      item.text().includes('使用 Authenticator 登录'),
    )
    expect(toggle).toBeTruthy()

    await toggle!.trigger('click')
    expect(wrapper.emitted('toggle-authenticator')).toEqual([[true]])
    wrapper.unmount()
  })

  it('免密登录模式隐藏密码、只留动态码，并可返回密码登录', async () => {
    const wrapper = mountForm({ loginAuthenticatorMode: true, authAuthenticatorCode: '123456' })

    expect(wrapper.find('input[type="password"]').exists()).toBe(false)
    const codeInput = wrapper.findAll('input').find(
      (input) => input.attributes('placeholder') === '输入 6 位动态码',
    )
    expect(codeInput).toBeTruthy()
    expect(codeInput!.attributes('value')).toBe('123456')

    await codeInput!.setValue('654321')
    expect(wrapper.emitted('update:authAuthenticatorCode')).toEqual([['654321']])

    const back = wrapper.findAll('button').find((item) => item.text().includes('返回密码登录'))
    await back!.trigger('click')
    expect(wrapper.emitted('toggle-authenticator')).toEqual([[false]])
    wrapper.unmount()
  })

  it('密码登录进入 TOTP 第二步时不再显示「重新发送」', () => {
    const wrapper = mountForm({
      loginRequiresTwoFactor: true,
      loginTwoFactorDelivery: 'totp',
    })

    expect(wrapper.find('input[type="password"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('动态码')
    expect(wrapper.text()).not.toContain('邮箱验证码')
    expect(wrapper.findAll('button').some((item) => item.text().includes('重新发送'))).toBe(false)
    wrapper.unmount()
  })
})
