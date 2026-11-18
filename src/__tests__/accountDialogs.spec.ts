import { mount, type VueWrapper } from '@vue/test-utils'
import type { Component } from 'vue'
import { describe, expect, it } from 'vitest'

import CloseAccountDialog from '@/components/account/CloseAccountDialog.vue'
import CloseSettleDialog from '@/components/account/CloseSettleDialog.vue'
import EmailDialog from '@/components/account/EmailDialog.vue'

/**
 * 账号与安全页「改邮箱 / 注销账号 / 注销结算账户」三个弹窗的父子接口。
 *
 * 「改用户名」弹窗已按契约删除（`PUT /settings/profile` 不接受自助改登录名），对应用例一并移除。
 *
 * 重点不是长什么样，而是**事件键名与次数**：`v-model:visible` 走的是带冒号的
 * `update:visible`，写成 `updateVisible` 会静默不触发；父级提交时读的是自己那份草稿，
 * 所以每个 `update:xxx` 都必须一次输入刚好发一次。
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
      emailCode: '',
      codeSending: false,
      request: null,
      loading: false,
      ...overrides,
    })
  }

  it('警示文案改口径：申请期 + 数据保留，确认词输入回传 update:value', async () => {
    const wrapper = mountClose()
    expect(wrapper.text()).toContain('注销申请提交后不会立即生效')
    expect(wrapper.text()).toContain('历史合同、支付和业务记录会保留')
    expect(wrapper.text()).toContain('请输入“注销账号”确认')

    await wrapper.find('#account-close-confirmation').setValue('注销账号')

    expect(wrapper.emitted('update:value')).toEqual([['注销账号']])
    wrapper.unmount()
  })

  it('验证码输入回传 update:email-code，「发送验证码」发 send-code', async () => {
    const wrapper = mountClose()

    await wrapper.find('#account-close-email-code').setValue('123456')
    await buttonByText(wrapper, '发送验证码').trigger('click')

    expect(wrapper.emitted('update:email-code')).toEqual([['123456']])
    expect(wrapper.emitted('send-code')).toHaveLength(1)
    wrapper.unmount()
  })

  it('未就绪时「提交注销申请」禁用，点了也不发 submit', async () => {
    const wrapper = mountClose({ ready: false })
    const confirm = buttonByText(wrapper, '提交注销申请')
    expect(confirm.attributes('disabled')).toBeDefined()

    await confirm.trigger('click')

    expect(wrapper.emitted('submit')).toBeUndefined()
    wrapper.unmount()
  })

  it('确认词与验证码就绪后点「提交注销申请」发一次 submit', async () => {
    const wrapper = mountClose({ ready: true })

    await buttonByText(wrapper, '提交注销申请').trigger('click')

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

  it('saving 时两个输入框、取消与「提交注销申请」全部禁用', () => {
    const wrapper = mountClose({ ready: true, saving: true })

    expect(wrapper.find('#account-close-confirmation').attributes('disabled')).toBeDefined()
    expect(wrapper.find('#account-close-email-code').attributes('disabled')).toBeDefined()
    expect(buttonByText(wrapper, '取消').attributes('disabled')).toBeDefined()
    expect(buttonByText(wrapper, '提交注销申请').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('已有待生效申请时只展示等待期，撤销发 cancel-request', async () => {
    const wrapper = mountClose({
      request: {
        pending: true,
        requested_at: '2026-11-16T10:00:00+08:00',
        effective_at: '2026-11-23T10:00:00+08:00',
        days_remaining: 7,
      },
    })

    expect(wrapper.text()).toContain('注销申请处理中')
    expect(wrapper.text()).toContain('剩余约 7 天')
    expect(wrapper.find('#account-close-confirmation').exists()).toBe(false)

    await buttonByText(wrapper, '撤销注销申请').trigger('click')

    expect(wrapper.emitted('cancel-request')).toHaveLength(1)
    expect(wrapper.emitted('submit')).toBeUndefined()
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
