import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import type { Component } from 'vue'
import { describe, expect, it } from 'vitest'
import { TSelect } from 'ui_73info'

import FaceidDialog from '@/components/account/FaceidDialog.vue'
import SettlementDialog from '@/components/account/SettlementDialog.vue'

/**
 * 「收款银行卡」「人脸核身」两个弹窗的父子接口。
 *
 * 盯的仍是**事件键名与次数**：`v-model:visible` 走 `update:visible`，五个表单字段各走自己的
 * `update:*`，写成驼峰或换一个名字都不会报错、只会让「点了没反应」。
 * 第四个用例是反证：把父级监听键写错，`settleForm` 不会动，提交时校验直接报「请选择开户银行」
 * ——接线断了在这个测试里必然红（见 `accountDialogsInViewSettleFaceid.spec.ts` 的端到端版本）。
 */
function mountDialog(component: Component, props: Record<string, unknown>): VueWrapper {
  return mount(component, {
    props: { visible: true, ...props },
    // TDialog 默认 teleport 到 body；测试里就地渲染，便于按选择器定位
    global: { stubs: { Teleport: true } },
  }) as VueWrapper
}

function buttonByText(wrapper: VueWrapper, text: string) {
  const found = wrapper.findAll('button').find((button) => button.text().includes(text))
  if (!found) {
    throw new Error(`弹窗里找不到按钮：${text}`)
  }
  return found
}

/**
 * 收款银行卡弹窗**不能** stub Teleport：它里面的四个 `TSelect` 在「stub 掉 Teleport」的测试替身下
 * 会自我递归更新（`Maximum recursive updates exceeded`，真实 teleport 下不出现）。
 * 所以这里照真实行为挂到 body 上，再按 `document` 找节点。
 */
function mountLive(component: Component, props: Record<string, unknown>): VueWrapper {
  return mount(component, {
    props: { visible: true, ...props },
    attachTo: document.body,
  }) as VueWrapper
}

/** 按可见文案找 body 上的按钮（teleport 之后不在 wrapper 的子树里）。 */
function bodyButton(text: string): HTMLElement {
  const found = [...document.querySelectorAll('button')].find((button) =>
    (button.textContent ?? '').includes(text),
  )
  if (!found) {
    throw new Error(`弹窗里找不到按钮：${text}`)
  }
  return found as HTMLElement
}

function mountSettle(overrides: Record<string, unknown> = {}) {
  return mountLive(SettlementDialog, {
    loading: false,
    saving: false,
    bound: false,
    corporateLocked: false,
    subjectMismatch: false,
    subjectLabel: '个人',
    materialMissing: false,
    materialMissingText: '',
    providerError: '',
    rejected: false,
    cardPlaceholder: '请输入收款银行卡号',
    cardId: '',
    bankCode: '',
    provCode: '',
    areaCode: '',
    bankAcctType: '2',
    cities: [{ value: '330100', title: '杭州市' }],
    ...overrides,
  })
}

describe('SettlementDialog：收款银行卡弹窗', () => {
  it('卡号与四个下拉各回各的键，一次输入只发一次', async () => {
    const wrapper = mountSettle()

    const input = document.querySelector('input') as HTMLInputElement
    input.value = '6222021234567890123'
    input.dispatchEvent(new Event('input'))
    await nextTick()
    expect(wrapper.emitted('update:card-id')).toEqual([['6222021234567890123']])

    const selects = wrapper.findAllComponents(TSelect)
    expect(selects).toHaveLength(4) // 开户银行 / 开户省份 / 开户城市 / 账户类型

    selects[0]!.vm.$emit('update:modelValue', 'ALIPAY')
    selects[1]!.vm.$emit('update:modelValue', '310000')
    selects[2]!.vm.$emit('update:modelValue', '310100')
    selects[3]!.vm.$emit('update:modelValue', '1')
    await nextTick()

    expect(wrapper.emitted('update:bank-code')).toEqual([['ALIPAY']])
    expect(wrapper.emitted('update:prov-code')).toEqual([['310000']])
    expect(wrapper.emitted('update:area-code')).toEqual([['310100']])
    expect(wrapper.emitted('update:bank-acct-type')).toEqual([['1']])
    wrapper.unmount()
  })

  it('下拉清空回的是 null，草稿字段收到的是空串（字典里没有空键）', async () => {
    const wrapper = mountSettle({ provCode: '310000' })

    wrapper.findAllComponents(TSelect)[1]!.vm.$emit('update:modelValue', null)
    await nextTick()

    expect(wrapper.emitted('update:prov-code')).toEqual([['']])
    wrapper.unmount()
  })

  it('主按钮按绑定状态换文案，点击各发一次 submit / cancel / update:visible', async () => {
    const plain = mountSettle()
    bodyButton('绑定银行卡').click()
    await flushPromises()
    expect(plain.emitted('submit')).toHaveLength(1)
    plain.unmount()

    const corporate = mountSettle({ corporateLocked: true })
    bodyButton('绑定对公账户').click()
    await flushPromises()
    expect(corporate.emitted('submit')).toHaveLength(1)
    corporate.unmount()

    const bound = mountSettle({ bound: true })
    bodyButton('确认更换').click()
    await flushPromises()
    expect(bound.emitted('submit')).toHaveLength(1)
    // 「取消」交给父级清表单，所以走 cancel 而不是自己写可见性
    bodyButton('取消').click()
    expect(bound.emitted('cancel')).toHaveLength(1)
    expect(bound.emitted('update:visible')).toBeUndefined()
    bound.unmount()

    const closing = mountSettle()
    ;(document.querySelector('.t73-dialog__close') as HTMLElement).click()
    expect(closing.emitted('update:visible')).toEqual([[false]])
    closing.unmount()
  })

  it('渠道拒绝时把「下一步做什么」写出来，指路按钮只发 fix-material', async () => {
    const wrapper = mountSettle({
      providerError: 'prov_code 不能为空',
      rejected: true,
      corporateLocked: true,
    })

    expect(document.body.textContent).toContain('prov_code 不能为空')
    expect(document.body.textContent).toContain('变更认证类型')

    bodyButton('核对企业资料').click()
    expect(wrapper.emitted('fix-material')).toHaveLength(1)
    wrapper.unmount()
  })

  it('缺企业资料的两条提示各自给路，且都不直接改可见性', async () => {
    const mismatch = mountSettle({
      subjectMismatch: true,
      materialMissing: true,
      materialMissingText: '营业执照',
    })
    expect(document.body.textContent).toContain('企业实名资料缺少营业执照')
    bodyButton('补齐企业资料').click()
    expect(mismatch.emitted('fix-material')).toHaveLength(1)
    expect(mismatch.emitted('update:visible')).toBeUndefined()
    mismatch.unmount()

    const missing = mountSettle({ materialMissing: true, materialMissingText: '经营范围' })
    expect(document.body.textContent).toContain('企业实名资料缺少经营范围，无法开通企业收款账户')
    missing.unmount()
  })
})

function mountFaceid(overrides: Record<string, unknown> = {}) {
  return mountDialog(FaceidDialog, {
    enterprise: false,
    mobile: false,
    qrDataUrl: 'data:image/png;base64,qr',
    checking: false,
    withdrawing: false,
    changeBacked: false,
    ...overrides,
  })
}

describe('FaceidDialog：人脸核身弹窗', () => {
  it('三个动作各发一次自己的事件，可见性只走 update:visible', async () => {
    const wrapper = mountFaceid()

    await buttonByText(wrapper, '撤回认证').trigger('click')
    await buttonByText(wrapper, '打开认证页面').trigger('click')
    await buttonByText(wrapper, '查询结果').trigger('click')

    expect(wrapper.emitted('withdraw')).toHaveLength(1)
    expect(wrapper.emitted('open-page')).toHaveLength(1)
    expect(wrapper.emitted('check')).toHaveLength(1)
    expect(wrapper.emitted('update:visible')).toBeUndefined()

    await wrapper.find('.t73-dialog__close').trigger('click')
    expect(wrapper.emitted('update:visible')).toEqual([[false]])
    wrapper.unmount()
  })

  it('企业 / 个人 × 桌面 / 触屏四套标题文案都对得上', () => {
    const personalDesktop = mountFaceid()
    expect(personalDesktop.text()).toContain('请使用手机扫码，完成人脸核身认证')
    personalDesktop.unmount()

    const enterpriseDesktop = mountFaceid({ enterprise: true })
    expect(enterpriseDesktop.text()).toContain('请使用手机扫码，完成企业实名认证')
    enterpriseDesktop.unmount()

    const personalMobile = mountFaceid({ mobile: true })
    expect(personalMobile.text()).toContain('请完成人脸核身认证')
    // 触屏档不给二维码，只给「打开认证页面」的说明
    expect(personalMobile.find('img').exists()).toBe(false)
    personalMobile.unmount()
  })

  it('主体变更可还原时撤回按钮换成「取消变更，还原原主体」', () => {
    const wrapper = mountFaceid({ changeBacked: true })
    expect(buttonByText(wrapper, '取消变更，还原原主体')).toBeTruthy()
    wrapper.unmount()
  })
})
