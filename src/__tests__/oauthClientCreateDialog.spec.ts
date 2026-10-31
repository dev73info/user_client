import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'

import OAuthClientCreateDialog from '@/components/dev/OAuthClientCreateDialog.vue'

/**
 * 新建客户端弹窗：只钉「打开时长什么样、输入与按钮往外交什么」。
 * 请求、校验与关闭时机都在视图 / composable，不在本组件里。
 */
const wrappers: ReturnType<typeof mount>[] = []

function mountDialog(overrides: Record<string, unknown> = {}) {
  const wrapper = mount(OAuthClientCreateDialog, {
    attachTo: document.body,
    props: {
      open: true,
      name: '',
      redirectUris: '',
      scopes: ['profile'],
      submitting: false,
      ...overrides,
    },
  })
  wrappers.push(wrapper)
  return wrapper
}

afterEach(() => {
  while (wrappers.length) {
    wrappers.pop()?.unmount()
  }
})

describe('新建客户端弹窗', () => {
  it('渲染表单、权限范围与页脚按钮', async () => {
    mountDialog()
    await nextTick()

    expect(document.body.querySelector('.t73-dialog__title')?.textContent).toBe('新建客户端')
    expect(
      document.body.querySelector<HTMLInputElement>('.t73-dialog input[type="text"]')?.placeholder,
    ).toBe('例如：我的小工具站')
    expect(document.body.querySelectorAll('.t73-dialog textarea')).toHaveLength(1)
    expect(document.body.querySelectorAll('.dev-oauth-clients__scope')).toHaveLength(2)
    expect(
      [...document.body.querySelectorAll('.t73-dialog__footer button')].map((button) =>
        button.textContent?.trim(),
      ),
    ).toEqual(['取消', '创建客户端'])
  })

  it('输入与勾选都往外抛，提交按钮触发 submit', async () => {
    const wrapper = mountDialog({ name: '演示', scopes: ['profile'] })
    await nextTick()

    const nameInput = document.body.querySelector<HTMLInputElement>(
      '.t73-dialog input[type="text"]',
    )!
    nameInput.value = '新名字'
    nameInput.dispatchEvent(new Event('input'))
    await nextTick()
    const names = wrapper.emitted('update:name') ?? []
    expect(names[names.length - 1]).toEqual(['新名字'])

    const checks = document.body.querySelectorAll<HTMLInputElement>(
      '.dev-oauth-clients__scope input',
    )
    expect(checks[0]!.checked).toBe(true)
    checks[1]!.click()
    await nextTick()
    const scopes = wrapper.emitted('toggle-scope') ?? []
    expect(scopes[scopes.length - 1]).toEqual(['purchase'])

    const submit = [...document.body.querySelectorAll<HTMLButtonElement>(
      '.t73-dialog__footer button',
    )].find((button) => button.textContent?.includes('创建客户端'))!
    submit.click()
    await nextTick()
    expect(wrapper.emitted('submit')).toHaveLength(1)
  })

  it('点取消关闭弹窗', async () => {
    const wrapper = mountDialog()
    await nextTick()

    const cancel = [...document.body.querySelectorAll<HTMLButtonElement>(
      '.t73-dialog__footer button',
    )].find((button) => button.textContent?.trim() === '取消')!
    cancel.click()
    await nextTick()
    const events = wrapper.emitted('update:open') ?? []
    expect(events[events.length - 1]).toEqual([false])
  })
})
