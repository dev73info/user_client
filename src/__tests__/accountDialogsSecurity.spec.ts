/**
 * 账号与安全页「登录凭证」两个弹窗（改密码 / 两步验证）的父子接口。
 *
 * 重点不是长什么样，而是**事件键名与次数**：草稿走 `update:password` / `update:confirm` /
 * `update:code` 这些带冒号的键，开关走单独的 `toggle`，写成驼峰都会静默不触发。
 */
import { mount, type VueWrapper } from '@vue/test-utils'
import type { Component } from 'vue'
import { describe, expect, it } from 'vitest'

import PasswordDialog from '@/components/account/PasswordDialog.vue'
import TwoFactorDialog from '@/components/account/TwoFactorDialog.vue'

function mountDialog(component: Component, props: Record<string, unknown>): VueWrapper {
  return mount(component, {
    props: { visible: true, ...props },
    // TDialog 默认 teleport 到 body；测试里就地渲染，便于按选择器定位
    global: { stubs: { Teleport: true } },
  }) as VueWrapper
}

/** 按可见文案找按钮（弹窗里的按钮没有稳定 class，文案才是用户看得到的那一层）。 */
function buttonByText(wrapper: VueWrapper, text: string) {
  const found = wrapper.findAll('button').find((button) => button.text().includes(text))
  if (!found) {
    throw new Error(`弹窗里找不到按钮：${text}`)
  }
  return found
}

describe('PasswordDialog：改密码弹窗', () => {
  function mountPassword(overrides: Record<string, unknown> = {}) {
    return mountDialog(PasswordDialog, {
      initialOldPassword: '',
      initialPassword: '',
      initialConfirm: '',
      initialCode: '',
      saving: false,
      codeSending: false,
      emailBound: true,
      ...overrides,
    })
  }

  it('四个输入框各自回传自己的事件键，一次输入只发一次', async () => {
    const wrapper = mountPassword()
    const inputs = wrapper.findAll('input')
    expect(inputs).toHaveLength(4)
    expect(inputs[0]!.attributes('placeholder')).toBe('请输入当前密码')
    expect(inputs[1]!.attributes('placeholder')).toBe('请输入新的密码，至少 6 位')
    expect(inputs[2]!.attributes('placeholder')).toBe('请再次输入新密码')
    expect(inputs[3]!.attributes('placeholder')).toBe('输入6位验证码')

    await inputs[0]!.setValue('old-pw123456')
    await inputs[1]!.setValue('pw123456')
    await inputs[2]!.setValue('pw123456')
    await inputs[3]!.setValue('654321')

    expect(wrapper.emitted('update:old-password')).toEqual([['old-pw123456']])
    expect(wrapper.emitted('update:password')).toEqual([['pw123456']])
    expect(wrapper.emitted('update:confirm')).toEqual([['pw123456']])
    expect(wrapper.emitted('update:code')).toEqual([['654321']])
    wrapper.unmount()
  })

  it('「发送验证码」发 send-code、「保存密码」发 submit，各一次', async () => {
    const wrapper = mountPassword()

    await buttonByText(wrapper, '发送验证码').trigger('click')
    await buttonByText(wrapper, '保存密码').trigger('click')

    expect(wrapper.emitted('send-code')).toHaveLength(1)
    expect(wrapper.emitted('submit')).toHaveLength(1)
    wrapper.unmount()
  })

  it('没绑邮箱时发码与保存都点不动（改了密码也收不到验证码）', () => {
    const wrapper = mountPassword({ emailBound: false })

    expect(buttonByText(wrapper, '发送验证码').attributes('disabled')).toBeDefined()
    expect(buttonByText(wrapper, '保存密码').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('codeSending 时只有第一行禁用，saving 时三行全部禁用', () => {
    const sending = mountPassword({ codeSending: true })
    expect(sending.findAll('input')[0]!.attributes('disabled')).toBeDefined()
    expect(sending.findAll('input')[2]!.attributes('disabled')).toBeUndefined()
    expect(buttonByText(sending, '发送中...').attributes('disabled')).toBeDefined()
    sending.unmount()

    const saving = mountPassword({ saving: true })
    expect(
      saving.findAll('input').every((input) => input.attributes('disabled') !== undefined),
    ).toBe(true)
    expect(buttonByText(saving, '保存中...').attributes('disabled')).toBeDefined()
    saving.unmount()
  })
})

describe('TwoFactorDialog：两步验证弹窗', () => {
  function mountTwoFactor(overrides: Record<string, unknown> = {}) {
    return mountDialog(TwoFactorDialog, {
      targetEnabled: false,
      code: '',
      saving: false,
      codeSending: false,
      changed: true,
      emailBound: true,
      emailLabel: 'old@example.com',
      ...overrides,
    })
  }

  it('默认停在邮箱验证码这一档，当前邮箱按父级折算的文案显示', () => {
    const wrapper = mountTwoFactor()

    const methods = wrapper.findAll('.account-2fa-method')
    expect(methods).toHaveLength(2)
    expect(methods[0]!.classes()).toContain('active')
    expect(methods[1]!.attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('当前邮箱：old@example.com')
    wrapper.unmount()
  })

  it('拨动开关回传 toggle(true/false)，不是 update:xxx', async () => {
    const wrapper = mountTwoFactor()
    const box = wrapper.find('input[type="checkbox"]')

    await box.setValue(true)
    expect(wrapper.emitted('toggle')).toEqual([[true]])

    await box.setValue(false)
    expect(wrapper.emitted('toggle')).toEqual([[true], [false]])
    wrapper.unmount()
  })

  it('验证码输入回传 update:code，发送与保存各发一次自己的事件', async () => {
    const wrapper = mountTwoFactor()

    await wrapper.find('.account-security-actions input').setValue('123456')
    await buttonByText(wrapper, '发送验证码').trigger('click')
    await buttonByText(wrapper, '保存设置').trigger('click')

    expect(wrapper.emitted('update:code')).toEqual([['123456']])
    expect(wrapper.emitted('send-code')).toHaveLength(1)
    expect(wrapper.emitted('submit')).toHaveLength(1)
    wrapper.unmount()
  })

  it('设置没变化时验证码与两个按钮都禁用（避免白跑一次请求）', () => {
    const wrapper = mountTwoFactor({ changed: false })

    expect(wrapper.find('.account-security-actions input').attributes('disabled')).toBeDefined()
    expect(buttonByText(wrapper, '发送验证码').attributes('disabled')).toBeDefined()
    expect(buttonByText(wrapper, '保存设置').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('没绑邮箱时开关也点不动', () => {
    const wrapper = mountTwoFactor({ emailBound: false })

    expect(wrapper.find('input[type="checkbox"]').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })
})
