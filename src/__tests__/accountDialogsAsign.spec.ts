/**
 * 账号与安全页「爱签账户管理」与「印章管理」两个弹窗的父子接口。
 *
 * 重点不是长什么样，而是**事件键名与次数**：九个字段各走自己的 `update:xxx`、
 * 四套表单各走自己的确认事件，写错一个就是「点得动但什么都没发生」。
 */
import { mount, type VueWrapper } from '@vue/test-utils'
import type { Component } from 'vue'
import { describe, expect, it } from 'vitest'

import AsignDialog from '@/components/account/AsignDialog.vue'
import SealDialog from '@/components/account/SealDialog.vue'

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

describe('SealDialog：印章管理弹窗', () => {
  const seals = {
    seals: [
      {
        sealNo: 'S-1',
        sealName: '公司公章',
        sealUrl: 'https://example.com/s1.png',
        isDefault: true,
      },
      { sealNo: 'S-2', sealName: '合同专用章', isDefault: false },
    ],
    message: '',
  }

  function mountSeal(overrides: Record<string, unknown> = {}) {
    return mountDialog(SealDialog, {
      loading: false,
      error: '',
      data: seals,
      making: false,
      ...overrides,
    })
  }

  it('有印章时逐枚列出，默认印章带标记', () => {
    const wrapper = mountSeal()

    expect(wrapper.findAll('.seal-item')).toHaveLength(2)
    expect(wrapper.text()).toContain('公司公章')
    expect(wrapper.text()).toContain('印章编号：S-2')
    expect(wrapper.text()).toContain('默认印章')
    wrapper.unmount()
  })

  it('没有印章时用后端给的说明，没给就用默认文案', () => {
    const withMessage = mountSeal({ data: { seals: [], message: '尚未完成企业认证' } })
    expect(withMessage.find('.seal-empty').text()).toBe('尚未完成企业认证')
    withMessage.unmount()

    const fallback = mountSeal({ data: null })
    expect(fallback.find('.seal-empty').text()).toBe('尚未创建企业印章，可在线制作一枚。')
    fallback.unmount()
  })

  it('查询失败时整块换成「重新查询」，点了回传 reload', async () => {
    const wrapper = mountSeal({ error: '查询企业印章失败' })

    expect(wrapper.find('.seal-dialog__alert').exists()).toBe(true)
    expect(wrapper.find('.seal-list').exists()).toBe(false)
    await buttonByText(wrapper, '重新查询').trigger('click')

    expect(wrapper.emitted('reload')).toHaveLength(1)
    wrapper.unmount()
  })

  it('「在线制作新印章」与「修改企业信息」各发一次自己的事件', async () => {
    const wrapper = mountSeal()

    await buttonByText(wrapper, '在线制作新印章').trigger('click')
    await buttonByText(wrapper, '修改企业信息').trigger('click')

    expect(wrapper.emitted('make-online')).toHaveLength(1)
    expect(wrapper.emitted('open-company')).toHaveLength(1)
    wrapper.unmount()
  })
})

describe('AsignDialog：爱签账户管理弹窗', () => {
  const loading = {
    sendCode: false,
    mobileByCode: false,
    legalPerson: false,
    company: false,
    personal: false,
  }

  function mountAsign(kind: string, overrides: Record<string, unknown> = {}) {
    return mountDialog(AsignDialog, {
      kind,
      mobile: '',
      code: '',
      legalPersonName: '',
      legalPersonIdCard: '',
      companyName: '',
      companyLegalName: '',
      companyLegalIdCard: '',
      personalName: '',
      personalMobile: '',
      loading,
      mobileMasked: '',
      ...overrides,
    })
  }

  it('kind 决定标题与表单：四套各认一套标题', () => {
    for (const [kind, title] of [
      ['mobile', '修改手机号'],
      ['legalPerson', '修改法人'],
      ['company', '企业信息'],
      ['personal', '修改姓名'],
    ] as const) {
      const wrapper = mountAsign(kind)
      expect(wrapper.find('.t73-dialog__title').text()).toBe(title)
      wrapper.unmount()
    }

    const unknown = mountAsign('somethingElse')
    expect(unknown.find('.t73-dialog__title').text()).toBe('爱签账户管理')
    unknown.unmount()
  })

  it('改手机号：两个输入各回传自己的键，发码与确认各发一次', async () => {
    const wrapper = mountAsign('mobile')
    const inputs = wrapper.findAll('input')
    expect(inputs[0]!.attributes('placeholder')).toBe('新手机号')
    expect(inputs[1]!.attributes('placeholder')).toBe('短信验证码')

    await inputs[0]!.setValue('13900001111')
    await inputs[1]!.setValue('123456')
    await buttonByText(wrapper, '发送验证码').trigger('click')
    await buttonByText(wrapper, '确认修改').trigger('click')

    expect(wrapper.emitted('update:mobile')).toEqual([['13900001111']])
    expect(wrapper.emitted('update:code')).toEqual([['123456']])
    expect(wrapper.emitted('send-code')).toHaveLength(1)
    expect(wrapper.emitted('modify-mobile')).toHaveLength(1)
    wrapper.unmount()
  })

  it('改法人 / 企业信息 / 改姓名：各自的字段键与确认事件互不串台', async () => {
    const legal = mountAsign('legalPerson')
    await legal.findAll('input')[0]!.setValue('张三')
    await legal.findAll('input')[1]!.setValue('530000199001010011')
    await buttonByText(legal, '确认修改').trigger('click')
    expect(legal.emitted('update:legal-person-name')).toEqual([['张三']])
    expect(legal.emitted('update:legal-person-id-card')).toEqual([['530000199001010011']])
    expect(legal.emitted('modify-legal-person')).toHaveLength(1)
    legal.unmount()

    const company = mountAsign('company')
    await company.findAll('input')[0]!.setValue('新公司名')
    await company.findAll('input')[1]!.setValue('李四')
    await company.findAll('input')[2]!.setValue('530000199001010022')
    await buttonByText(company, '确认修改').trigger('click')
    expect(company.emitted('update:company-name')).toEqual([['新公司名']])
    expect(company.emitted('update:company-legal-name')).toEqual([['李四']])
    expect(company.emitted('update:company-legal-id-card')).toEqual([['530000199001010022']])
    expect(company.emitted('modify-company')).toHaveLength(1)
    company.unmount()

    const personal = mountAsign('personal')
    await personal.findAll('input')[0]!.setValue('王五')
    await personal.findAll('input')[1]!.setValue('13900002222')
    await buttonByText(personal, '确认修改').trigger('click')
    expect(personal.emitted('update:personal-name')).toEqual([['王五']])
    expect(personal.emitted('update:personal-mobile')).toEqual([['13900002222']])
    expect(personal.emitted('modify-user-name')).toHaveLength(1)
    personal.unmount()
  })

  it('改姓名时手机号提示带当前脱敏号，没有脱敏号就退回通用文案', () => {
    const withMask = mountAsign('personal', { mobileMasked: '139****2222' })
    expect(withMask.findAll('input')[1]!.attributes('placeholder')).toBe(
      '请输入本人手机号（当前 139****2222）',
    )
    withMask.unmount()

    const withoutMask = mountAsign('personal')
    expect(withoutMask.findAll('input')[1]!.attributes('placeholder')).toBe('请输入本人手机号')
    withoutMask.unmount()
  })

  it('按钮加载位来自父级的 loading，按当前那一套表单取', () => {
    const wrapper = mountAsign('mobile', {
      loading: { ...loading, sendCode: true },
    })

    expect(buttonByText(wrapper, '发送验证码').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })
})
