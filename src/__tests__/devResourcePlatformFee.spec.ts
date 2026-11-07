import { shallowMount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ResourceInitBasicInfoSection from '@/components/dev/ResourceInitBasicInfoSection.vue'
import type { ResourceCreationType, ResourcePaidMode } from '@/shared/resourceCreation'

/** 基础信息区块的必填入参；只关心抽成披露时用默认值补齐，避免每个用例抄一遍。 */
function mountSection(
  overrides: Partial<{
    creationType: ResourceCreationType
    paidMode: ResourcePaidMode
    isApiKind: boolean
    platformFeeBps: number | null
    platformFeeError: boolean
    priceYuan: string
    pricePoints: string
  }> = {},
) {
  return shallowMount(ResourceInitBasicInfoSection, {
    props: {
      coverUrl: '',
      coverFile: null,
      title: '',
      ownershipType: 'individual',
      teamId: '',
      originType: 'original',
      copyrightDeclared: false,
      originAuthor: '',
      originUrl: '',
      originOrg: '',
      originNote: '',
      priceYuan: '',
      pricePoints: '',
      promoSharePercent: 0,
      creationType: 'paid',
      paidMode: 'buyout',
      isApiKind: false,
      effectiveOriginType: 'original',
      hasJoinedTeam: false,
      hasTeams: false,
      teamOptions: [],
      cashPriceDisabled: false,
      pointsPriceDisabled: false,
      showCopyrightField: true,
      promoShareError: '',
      promoShareDisplay: '0%',
      promoShareOff: true,
      platformFeeBps: 400,
      platformFeeError: false,
      ...overrides,
    },
    global: {
      // 区块自己在 ui_73info 的 TForm 里；默认桩不透出插槽，这里显式透出，
      // 售价旁的抽成提示才进得到断言。其余 ui_73info 组件与图标选择器走自动桩。
      stubs: {
        TForm: { template: '<form><slot /></form>' },
      },
    },
  })
}

describe('ResourceInitBasicInfoSection：平台抽成披露', () => {
  it('付费资源展示抽成比例与预计到手', () => {
    const wrapper = mountSection({
      creationType: 'paid',
      platformFeeBps: 400,
      priceYuan: '100',
    })

    const hint = wrapper.find('.dev-platform-fee-hint')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toBe('平台抽成 4%（按成交价扣除），买家支付价不变，预计到手 ¥96.00')
    expect(hint.classes()).toContain('dev-field-hint')

    wrapper.unmount()
  })

  it('没有填售价时只给费率与买家价不变', () => {
    const wrapper = mountSection({ creationType: 'paid', platformFeeBps: 400, priceYuan: '' })

    expect(wrapper.find('.dev-platform-fee-hint').text()).toBe(
      '平台抽成 4%（按成交价扣除），买家支付价不变',
    )

    wrapper.unmount()
  })

  it('免费资源不展示抽成比例', () => {
    const wrapper = mountSection({ creationType: 'free', platformFeeBps: 400 })

    expect(wrapper.find('.dev-platform-fee-hint').exists()).toBe(false)

    wrapper.unmount()
  })

  it('接口读取中（无比例且无错误）不展示', () => {
    const wrapper = mountSection({ creationType: 'paid', platformFeeBps: null })

    expect(wrapper.find('.dev-platform-fee-hint').exists()).toBe(false)

    wrapper.unmount()
  })

  it('接口失败时明确提示费率不可用，不静默消失', () => {
    const wrapper = mountSection({
      creationType: 'paid',
      platformFeeBps: null,
      platformFeeError: true,
    })

    const hint = wrapper.find('.dev-platform-fee-hint')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toBe('费率暂不可用，请刷新')
    expect(hint.classes()).toContain('dev-field-hint--error')

    wrapper.unmount()
  })

  it('付费资源常驻 7 天公告提示', () => {
    const wrapper = mountSection({ creationType: 'paid' })

    expect(wrapper.find('.dev-platform-fee-notice').text()).toBe(
      '费率调整提前 7 天公告，已下单订单不受影响',
    )

    wrapper.unmount()
  })
})
