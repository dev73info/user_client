import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import type { McResourcePayload } from '@/api/mcResources'
import MyResourceRow from '@/components/resource/MyResourceRow.vue'
import { resourceFixture } from './devResourceHomepageFixtures'

/** 下拉与按钮只留能读到 command / disabled 的壳；其余细节不在这一层断言。 */
const stubs = {
  TDropdown: {
    name: 'TDropdown',
    emits: ['command'],
    template: '<div><slot /></div><slot name="dropdown" />',
  },
  TDropdownMenu: { template: '<div><slot /></div>' },
  TDropdownItem: {
    name: 'TDropdownItem',
    props: ['command', 'disabled'],
    template: '<button type="button" :disabled="disabled"><slot /></button>',
  },
  TButton: { template: '<button type="button"><slot /></button>' },
  TIcon: { template: '<span><slot /></span>' },
  TTag: { template: '<span><slot /></span>' },
}

function mountRow(
  resource: Partial<McResourcePayload> = {},
  props: Partial<{
    versionPrices: Record<number, number>
    platformFeeBps: number | null
    platformFeeError: boolean
    requestingReviewId: number | null
    settingPrivateId: number | null
  }> = {},
) {
  return mount(MyResourceRow, {
    props: {
      resource: resourceFixture({
        requirement_id: '2026-1',
        requirement_claimed: true,
        ...resource,
      }),
      versionPrices: {},
      platformFeeBps: 1000,
      platformFeeError: false,
      requestingReviewId: null,
      settingPrivateId: null,
      ...props,
    },
    global: { stubs },
  })
}

function menuItem(wrapper: ReturnType<typeof mountRow>, action: string) {
  return wrapper
    .findAllComponents({ name: 'TDropdownItem' })
    .find((item) => (item.props('command') as { action: string }).action === action)
}

describe('MyResourceRow：我的资源卡片行', () => {
  it.each([
    ['draft', '私有', null],
    ['published', '公开', 'wb-badge--success'],
    ['review', '审核中', 'wb-badge--warning'],
    ['rejected', '已驳回', 'wb-badge--danger'],
  ] as const)('可见性 %s 显示「%s」徽标', (visibility, label, modifier) => {
    const wrapper = mountRow({ visibility })
    const badge = wrapper.find('.wb-item__title-row .wb-badge')

    expect(badge.text()).toBe(label)
    if (modifier) {
      expect(badge.classes()).toContain(modifier)
    }
    wrapper.unmount()
  })

  it('锁定资源同时显示「已锁定」徽标与接口资源之外的 BETA 口径', () => {
    const wrapper = mountRow({ visibility: 'draft', requirement_archive_locked: true })

    const locked = wrapper.findAll('.wb-badge').find((badge) => badge.text() === '已锁定')
    expect(locked?.classes()).toContain('wb-badge--warning')
    wrapper.unmount()
  })

  it('接口资源在标题行挂 BETA，售价行不再重复挂', () => {
    const wrapper = mountRow({ resource_kind: 'api' })

    expect(wrapper.find('[data-testid="resource-api-tag"]').exists()).toBe(true)
    expect(wrapper.findAllComponents({ name: 'BetaTag' })).toHaveLength(1)
    wrapper.unmount()
  })

  it('售价列按 shared 口径展示价格与预计到手', () => {
    const wrapper = mountRow({ buyout_price_fen: 1234, price_fen: 1234 })

    expect(wrapper.find('.my-resource-row__price-value').text()).toBe('¥12.34')
    expect(wrapper.text()).toContain('预计到手 ¥11.11')
    wrapper.unmount()
  })

  it('费率读取失败且资源有价：写明费率暂不可用', () => {
    const wrapper = mountRow(
      { buyout_price_fen: 1234 },
      { platformFeeBps: null, platformFeeError: true },
    )

    expect(wrapper.text()).toContain('预计到手 费率暂不可用')
    wrapper.unmount()
  })

  it('免费资源只写售价，不写预计到手', () => {
    const wrapper = mountRow({ buyout_price_fen: 0, price_points: 0 })

    expect(wrapper.find('.my-resource-row__price-value').text()).toBe('免费')
    expect(wrapper.text()).not.toContain('预计到手')
    wrapper.unmount()
  })

  it('菜单项随可见性与资源类别收窄', () => {
    const draft = mountRow({ visibility: 'draft' })
    expect(menuItem(draft, 'publish')).toBeTruthy()
    expect(menuItem(draft, 'request-review')).toBeTruthy()
    expect(menuItem(draft, 'versions')).toBeTruthy()
    expect(menuItem(draft, 'set-private')).toBeUndefined()
    draft.unmount()

    const published = mountRow({ visibility: 'published' })
    expect(menuItem(published, 'set-private')).toBeTruthy()
    expect(menuItem(published, 'request-review')).toBeUndefined()
    published.unmount()

    const rejected = mountRow({ visibility: 'rejected' })
    expect(menuItem(rejected, 'request-review')?.text()).toContain('重新申请公开')
    rejected.unmount()

    const api = mountRow({ visibility: 'draft', resource_kind: 'api' })
    expect(menuItem(api, 'publish')).toBeUndefined()
    expect(menuItem(api, 'versions')).toBeUndefined()
    expect(menuItem(api, 'request-review')).toBeTruthy()
    api.unmount()
  })

  it('未 claim 的定制资源禁用「申请公开」，锁定资源禁用发版', () => {
    const unclaimed = mountRow({ visibility: 'rejected', requirement_claimed: false })
    expect(menuItem(unclaimed, 'request-review')?.props('disabled')).toBe(true)
    unclaimed.unmount()

    const locked = mountRow({ visibility: 'draft', requirement_archive_locked: true })
    expect(menuItem(locked, 'publish')?.props('disabled')).toBe(true)
    expect(menuItem(locked, 'request-review')?.props('disabled')).toBe(true)
    locked.unmount()
  })

  it('提交中 / 设置中在菜单项上原地报状态', () => {
    const requesting = mountRow({ visibility: 'draft' }, { requestingReviewId: 158100 })
    expect(menuItem(requesting, 'request-review')?.text()).toBe('提交中...')
    expect(menuItem(requesting, 'request-review')?.props('disabled')).toBe(true)
    requesting.unmount()

    const setting = mountRow({ visibility: 'published' }, { settingPrivateId: 158100 })
    expect(menuItem(setting, 'set-private')?.text()).toBe('设置中...')
    expect(menuItem(setting, 'set-private')?.props('disabled')).toBe(true)
    setting.unmount()
  })

  it('整行点击 / 回车与「编辑主页」都 emit edit，行内控件不触发行跳转', async () => {
    const wrapper = mountRow()
    const row = wrapper.find('.wb-item')

    await row.trigger('click')
    expect((wrapper.emitted('edit')?.[0]?.[0] as McResourcePayload).id).toBe(158100)

    await row.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('edit')).toHaveLength(2)

    await wrapper
      .findAll('button')
      .find((button) => button.text() === '编辑主页')!
      .trigger('click')
    expect(wrapper.emitted('edit')).toHaveLength(3)

    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('更多'))!
      .trigger('click')
    expect(wrapper.emitted('edit')).toHaveLength(3)
    wrapper.unmount()
  })

  it('「更多」菜单把动作码原样 emit 给视图', async () => {
    const wrapper = mountRow()
    const resource = wrapper.props('resource') as McResourcePayload

    wrapper.findComponent({ name: 'TDropdown' }).vm.$emit('command', {
      action: 'publish',
      resource,
    })

    expect(wrapper.emitted('command')?.[0]?.[0]).toEqual({ action: 'publish', resource })
    wrapper.unmount()
  })
})
