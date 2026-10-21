import { mount, type VueWrapper } from '@vue/test-utils'
import type { Component } from 'vue'
import { describe, expect, it } from 'vitest'

import CloseAccountDialog from '@/components/account/CloseAccountDialog.vue'
import CloseSettleDialog from '@/components/account/CloseSettleDialog.vue'
import EmailDialog from '@/components/account/EmailDialog.vue'
import UsernameDialog from '@/components/account/UsernameDialog.vue'

/**
 * 账号与安全页四个弹窗组件（从 `AccountCouponsView` 拆出来）的父子接口。
 *
 * 重点不是长什么样，而是**事件键名与次数**：`v-model:visible` 走的是带冒号的
 * `update:visible`，写成 `updateVisible` 会静默不触发；父级提交时读的是自己那份草稿，
 * 所以 `update:value` / `update:email` / `update:code` 必须一次输入刚好发一次。
 */
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

describe('UsernameDialog：改用户名弹窗', () => {
  it('初值来自父级 initial，输入一次回传一次 update:value', async () => {
    const wrapper = mountDialog(UsernameDialog, { initial: 'alice', saving: false })
    const input = wrapper.find('input')
    expect((input.element as HTMLInputElement).value).toBe('alice')

    await input.setValue('alice_new')

    expect(wrapper.emitted('update:value')).toEqual([['alice_new']])
    wrapper.unmount()
  })

  it('点「保存用户名」只发一次 submit（校验与请求在视图）', async () => {
    const wrapper = mountDialog(UsernameDialog, { initial: 'alice', saving: false })

    await buttonByText(wrapper, '保存用户名').trigger('click')

    expect(wrapper.emitted('submit')).toHaveLength(1)
    wrapper.unmount()
  })

  it('saving 时输入框与按钮禁用、按钮文案换成「保存中...」', () => {
    const wrapper = mountDialog(UsernameDialog, { initial: 'alice', saving: true })

    expect(wrapper.find('input').attributes('disabled')).toBeDefined()
    const save = buttonByText(wrapper, '保存中...')
    expect(save.attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('关闭按钮把 update:visible 传成 false（update:open → update:visible 键名核对）', async () => {
    const wrapper = mountDialog(UsernameDialog, { initial: 'alice', saving: false })

    await wrapper.find('.t73-dialog__close').trigger('click')

    expect(wrapper.emitted('update:visible')).toEqual([[false]])
    wrapper.unmount()
  })

  it('visible=false 时整个弹窗不渲染（可见性仍由父级持有）', () => {
    const wrapper = mountDialog(UsernameDialog, { visible: false, initial: 'alice', saving: false })

    expect(wrapper.find('.dialog-form').exists()).toBe(false)
    wrapper.unmount()
  })

  it('弹窗内容节点带本组件的 scoped 属性：搬过来的 .dialog-form 仍然命中', () => {
    const wrapper = mountDialog(UsernameDialog, { initial: 'alice', saving: false })

    const form = wrapper.find('.dialog-form')
    expect(Object.keys(form.attributes()).some((name) => name.startsWith('data-v-'))).toBe(true)
    wrapper.unmount()
  })
})

describe('EmailDialog：改邮箱弹窗', () => {
  function mountEmail(overrides: Record<string, unknown> = {}) {
    return mountDialog(EmailDialog, {
      initialEmail: 'old@example.com',
      initialCode: '',
      saving: false,
      codeSending: false,
      ...overrides,
    })
  }

  it('两个输入框初值来自父级，各自回传自己的事件键', async () => {
    const wrapper = mountEmail()
    const email = wrapper.find('input[type="email"]')
    const code = wrapper.find('input[type="text"]')
    expect((email.element as HTMLInputElement).value).toBe('old@example.com')
    expect((code.element as HTMLInputElement).value).toBe('')

    await email.setValue('new@example.com')
    await code.setValue('123456')

    expect(wrapper.emitted('update:email')).toEqual([['new@example.com']])
    expect(wrapper.emitted('update:code')).toEqual([['123456']])
    wrapper.unmount()
  })

  it('「发送验证码」发 send-code、「保存邮箱」发 submit，各一次', async () => {
    const wrapper = mountEmail()

    await buttonByText(wrapper, '发送验证码').trigger('click')
    await buttonByText(wrapper, '保存邮箱').trigger('click')

    expect(wrapper.emitted('send-code')).toHaveLength(1)
    expect(wrapper.emitted('submit')).toHaveLength(1)
    wrapper.unmount()
  })

  it('codeSending 时新邮箱输入框与发码按钮禁用，文案换成「发送中...」', () => {
    const wrapper = mountEmail({ codeSending: true })

    expect(wrapper.find('input[type="email"]').attributes('disabled')).toBeDefined()
    expect(buttonByText(wrapper, '发送中...').attributes('disabled')).toBeDefined()
    // 验证码那一段不受发码影响
    expect(wrapper.find('input[type="text"]').attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })

  it('saving 时两个输入框与两个按钮都禁用', () => {
    const wrapper = mountEmail({ saving: true })

    expect(wrapper.find('input[type="email"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('input[type="text"]').attributes('disabled')).toBeDefined()
    expect(buttonByText(wrapper, '发送验证码').attributes('disabled')).toBeDefined()
    expect(buttonByText(wrapper, '保存中...').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })
})

describe('CloseAccountDialog：注销账号弹窗', () => {
  function mountClose(overrides: Record<string, unknown> = {}) {
    return mountDialog(CloseAccountDialog, {
      confirmation: '',
      ready: false,
      saving: false,
      ...overrides,
    })
  }

  it('警示文案原样保留，确认词输入回传 update:value', async () => {
    const wrapper = mountClose()
    expect(wrapper.text()).toContain('注销后将无法登录当前账号')
    expect(wrapper.text()).toContain('请输入“注销账号”确认')

    await wrapper.find('input').setValue('注销账号')

    expect(wrapper.emitted('update:value')).toEqual([['注销账号']])
    wrapper.unmount()
  })

  it('确认词没输对时「确认注销」禁用，点了也不发 submit', async () => {
    const wrapper = mountClose({ ready: false })
    const confirm = buttonByText(wrapper, '确认注销')
    expect(confirm.attributes('disabled')).toBeDefined()

    await confirm.trigger('click')

    expect(wrapper.emitted('submit')).toBeUndefined()
    wrapper.unmount()
  })

  it('确认词输对后点「确认注销」发一次 submit', async () => {
    const wrapper = mountClose({ ready: true })

    await buttonByText(wrapper, '确认注销').trigger('click')

    expect(wrapper.emitted('submit')).toHaveLength(1)
    wrapper.unmount()
  })

  it('取消回传 update:visible=false，不触发 submit', async () => {
    const wrapper = mountClose({ ready: true })

    await buttonByText(wrapper, '取消').trigger('click')

    expect(wrapper.emitted('update:visible')).toEqual([[false]])
    expect(wrapper.emitted('submit')).toBeUndefined()
    wrapper.unmount()
  })

  it('saving 时输入框、取消与「确认注销」全部禁用', () => {
    const wrapper = mountClose({ ready: true, saving: true })

    expect(wrapper.find('input').attributes('disabled')).toBeDefined()
    expect(buttonByText(wrapper, '取消').attributes('disabled')).toBeDefined()
    expect(buttonByText(wrapper, '确认注销').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })
})

describe('CloseSettleDialog：注销结算账户弹窗', () => {
  function mountClose(overrides: Record<string, unknown> = {}) {
    return mountDialog(CloseSettleDialog, {
      confirmation: '',
      ready: false,
      saving: false,
      ...overrides,
    })
  }

  it('警示文案与确认词标签原样保留', () => {
    const wrapper = mountClose()

    expect(wrapper.text()).toContain('注销后本账号将无法接收合同款与分账')
    expect(wrapper.text()).toContain('请输入“注销结算账户”确认')
    wrapper.unmount()
  })

  it('确认词输入回传 update:value，一次输入只发一次', async () => {
    const wrapper = mountClose()

    await wrapper.find('input').setValue('注销结算账户')

    expect(wrapper.emitted('update:value')).toEqual([['注销结算账户']])
    wrapper.unmount()
  })

  it('ready 决定「确认注销」能不能点：没输对不发 submit，输对后发一次', async () => {
    const wrapper = mountClose({ ready: false })
    expect(buttonByText(wrapper, '确认注销').attributes('disabled')).toBeDefined()
    await buttonByText(wrapper, '确认注销').trigger('click')
    expect(wrapper.emitted('submit')).toBeUndefined()

    await wrapper.setProps({ ready: true })
    await buttonByText(wrapper, '确认注销').trigger('click')
    expect(wrapper.emitted('submit')).toHaveLength(1)
    wrapper.unmount()
  })

  it('取消回传 update:visible=false', async () => {
    const wrapper = mountClose({ ready: true })

    await buttonByText(wrapper, '取消').trigger('click')

    expect(wrapper.emitted('update:visible')).toEqual([[false]])
    wrapper.unmount()
  })
})
