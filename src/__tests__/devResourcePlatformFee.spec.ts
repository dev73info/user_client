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
    platformFeePercent: string | null
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
      platformFeePercent: '4',
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
  it('付费资源在售价旁展示抽成比例', () => {
    const wrapper = mountSection({ creationType: 'paid', platformFeePercent: '4' })

    const hint = wrapper.find('.dev-platform-fee-hint')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toBe('平台抽成 4%（按成交价扣除）')
    // 提示挂在售价区块之后、独占一行
    expect(hint.classes()).toContain('dev-field-hint')

    wrapper.unmount()
  })

  it('免费资源不展示抽成比例', () => {
    const wrapper = mountSection({ creationType: 'free', platformFeePercent: '4' })

    expect(wrapper.find('.dev-platform-fee-hint').exists()).toBe(false)

    wrapper.unmount()
  })

  it('接口取不到比例时静默不展示', () => {
    const wrapper = mountSection({ creationType: 'paid', platformFeePercent: null })

    expect(wrapper.find('.dev-platform-fee-hint').exists()).toBe(false)

    wrapper.unmount()
  })
})
